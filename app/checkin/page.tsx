'use client';
import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import Link from 'next/link';
import {
  detectBlink,
  detectMotion,
  hasNaturalMovement,
  createInitialLivenessState,
  type LivenessState,
} from '@/lib/livenessDetection';
import { loadFaceModels } from '@/lib/faceApi';

type FaceUser = {
  name: string;
  surname: string;
  descriptor: number[];
};

// ติดตามสถานะการยืนยันแต่ละใบหน้า (สำหรับ multi-face)
type FaceTracker = {
  label: string;
  stableCount: number;
  lastDistance: number;
  livenessState: LivenessState;
  motionHistory: number[];
  blinkDetected: boolean;
  lastLandmarks: faceapi.FaceLandmarks68 | null;
};

export default function CheckIn() {
  const [status, setStatus] = useState('กำลังโหลดระบบ...');
  const [distanceStatus, setDistanceStatus] = useState<string>('');
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  const [livenessInfo, setLivenessInfo] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const usersRef = useRef<FaceUser[]>([]);

  // Face trackers สำหรับ multi-face matching + liveness
  const faceTrackersRef = useRef<Map<string, FaceTracker>>(new Map());

  // ตัวแปรกันบันทึกซ้ำ (Cooldown)
  const isProcessingRef = useRef(false);
  const lastLoggedNameRef = useRef<string | null>(null);
  const lastFailReasonRef = useRef<string | null>(null);
  const lastFailAtRef = useRef(0);
  const recentCheckInsRef = useRef<Set<string>>(new Set());

  // ค่ากำหนดสำหรับโซนและการตรวจจับ
  const ZONE_SIZE = 300;
  const MIN_FACE_WIDTH = 180;

  // === Adaptive Threshold (รองรับแมสก์) ===
  const THRESHOLD_STRICT = 0.35;
  const THRESHOLD_NORMAL = 0.48;
  const THRESHOLD_MASK = 0.55;

  const STABLE_FRAMES_STRICT = 3;
  const STABLE_FRAMES_NORMAL = 6;
  const STABLE_FRAMES_MASK = 12;

  // Liveness requirements
  const REQUIRED_BLINKS = 1; // ต้องกระพริบอย่างน้อย 1 ครั้ง
  const MOTION_HISTORY_SIZE = 10; // เก็บ motion 10 frame ล่าสุด

  const startVideo = () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => {
          console.error(err);
          setStatus('ไม่สามารถเปิดกล้องได้');
        });
    }
  };

  useEffect(() => {
    const loadResources = async () => {
      try {
        await loadFaceModels();

        const response = await fetch('/api/faces');
        const users = (await response.json()) as FaceUser[];
        usersRef.current = users;

        if (users.length === 0) {
          setStatus('ไม่พบฐานข้อมูลใบหน้า (กรุณาลงทะเบียนก่อน)');
          return;
        }

        const labeledDescriptors = users.map((user) => {
          const descriptor = new Float32Array(user.descriptor);
          return new faceapi.LabeledFaceDescriptors(`${user.name} ${user.surname}`, [descriptor]);
        });

        faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.58);

        setStatus('พร้อมใช้งาน (ยืนยันตัวตนด้วยใบหน้า)');
        startVideo();

      } catch (err) {
        console.error(err);
        setStatus('เกิดข้อผิดพลาดในการโหลดระบบ');
      }
    };
    loadResources();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const logCheckIn = async (fullName: string) => {
    if (lastLoggedNameRef.current === fullName || isProcessingRef.current) return;

    isProcessingRef.current = true;
    try {
      const parts = fullName.split(' ');
      const name = parts[0];
      const surname = parts.slice(1).join(' ');

      const response = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          surname,
          status: 'CHECK_IN',
          livenessVerified: true
        })
      });

      const result = await response.json();

      if (result.alreadyLogged) {
        setStatus(`คุณ ${name} บันทึกไปแล้วเมื่อครู่ (Cooldown 30 นาที)`);
      } else {
        setLastCheckIn(fullName);
        setStatus('✅ บันทึกเวลาสำเร็จ! (Liveness ผ่าน)');
      }

      lastLoggedNameRef.current = fullName;

      setTimeout(() => {
        isProcessingRef.current = false;
        lastLoggedNameRef.current = null;
      }, 5000);

    } catch (error) {
      console.error('Log Error', error);
      isProcessingRef.current = false;
    }
  };

  const logScanFail = async (reason: string, message: string, bestMatch?: string) => {
    const now = Date.now();
    if (lastFailReasonRef.current === reason && now - lastFailAtRef.current < 10_000) return;
    lastFailReasonRef.current = reason;
    lastFailAtRef.current = now;

    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'SCAN_FAIL',
          reason,
          distanceStatus: message,
          bestMatch,
          source: 'checkin'
        })
      });
    } catch (error) {
      console.error('Scan fail log error', error);
    }
  };

  const handleVideoPlay = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    faceTrackersRef.current.clear();

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || !faceMatcherRef.current || videoRef.current.paused || videoRef.current.ended) return;

      const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
      if (displaySize.width === 0) return;

      faceapi.matchDimensions(canvasRef.current, displaySize);

      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      if (!canvasRef.current) return;
      const context = canvasRef.current.getContext('2d');
      context?.clearRect(0, 0, displaySize.width, displaySize.height);

      // วาดกรอบเป้าหมาย
      const zoneX = (displaySize.width - ZONE_SIZE) / 2;
      const zoneY = (displaySize.height - ZONE_SIZE) / 2;
      context!.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      context!.setLineDash([5, 5]);
      context!.strokeRect(zoneX, zoneY, ZONE_SIZE, ZONE_SIZE);
      context!.setLineDash([]);

      let currentStatus = "";
      let foundValidFace = false;
      let failReason: string | null = null;
      let failMessage = '';
      let failBestMatch: string | undefined;

      const labelsInThisFrame = new Set<string>();

      resizedDetections.forEach(result => {
        if (!canvasRef.current) return;
        const { descriptor, landmarks } = result;
        const box = result.detection.box;

        const faceCenterX = box.x + box.width / 2;
        const faceCenterY = box.y + box.height / 2;
        const isInZone = faceCenterX > zoneX && faceCenterX < zoneX + ZONE_SIZE &&
          faceCenterY > zoneY && faceCenterY < zoneY + ZONE_SIZE;

        const isCloseEnough = box.width >= MIN_FACE_WIDTH;

        if (isInZone && isCloseEnough) {
          foundValidFace = true;
          const bestMatch = faceMatcherRef.current!.findBestMatch(descriptor);
          const distance = bestMatch.distance;
          const label = bestMatch.label;

          console.log(`[CHECK-IN] ${label}: distance=${distance.toFixed(3)}`);

          let boxColor = 'red';
          let matchStatus = '';

          if (label !== 'unknown') {
            labelsInThisFrame.add(label);

            // ดึง tracker หรือสร้างใหม่
            let tracker = faceTrackersRef.current.get(label);
            if (!tracker) {
              tracker = {
                label,
                stableCount: 0,
                lastDistance: distance,
                livenessState: createInitialLivenessState(),
                motionHistory: [],
                blinkDetected: false,
                lastLandmarks: null,
              };
              faceTrackersRef.current.set(label, tracker);
            }

            // === PASSIVE LIVENESS: Blink Detection ===
            const { isBlink, newState } = detectBlink(landmarks, tracker.livenessState);
            tracker.livenessState = newState;
            if (isBlink) {
              tracker.blinkDetected = true;
            }

            // === PASSIVE LIVENESS: Motion Detection ===
            if (tracker.lastLandmarks) {
              const motion = detectMotion(landmarks, tracker.lastLandmarks);
              tracker.motionHistory.push(motion);
              if (tracker.motionHistory.length > MOTION_HISTORY_SIZE) {
                tracker.motionHistory.shift();
              }
            }
            tracker.lastLandmarks = landmarks;

            // Check liveness status
            const hasMotion = hasNaturalMovement(tracker.motionHistory);
            const hasBlink = tracker.blinkDetected;
            const livenessOk = hasBlink || (hasMotion && tracker.motionHistory.length >= MOTION_HISTORY_SIZE);

            // สร้าง liveness info
            const blinkIcon = hasBlink ? '✅' : '⏳';
            const motionIcon = hasMotion ? '✅' : '⏳';
            setLivenessInfo(`กระพริบตา: ${blinkIcon} | เคลื่อนไหว: ${motionIcon}`);

            // กำหนดจำนวนเฟรมที่ต้องการตาม distance
            let requiredFrames: number;
            if (distance < THRESHOLD_STRICT) {
              requiredFrames = STABLE_FRAMES_STRICT;
              boxColor = '#00ff00';
            } else if (distance < THRESHOLD_NORMAL) {
              requiredFrames = STABLE_FRAMES_NORMAL;
              boxColor = '#ffff00';
            } else if (distance < THRESHOLD_MASK) {
              requiredFrames = STABLE_FRAMES_MASK;
              boxColor = '#ffa500';
            } else {
              requiredFrames = 999;
              boxColor = 'red';
              matchStatus = `❌ ${label} (${distance.toFixed(2)}) - ไม่ตรง`;
            }

            if (distance < THRESHOLD_MASK) {
              // ต้องผ่าน liveness ด้วย
              if (!livenessOk) {
                matchStatus = `⏳ ${label} - รอยืนยันตัวตน (กระพริบตา/ขยับ)`;
                boxColor = '#9966ff'; // ม่วง = รอ liveness
              } else {
                tracker.stableCount += 1;
                tracker.lastDistance = distance;

                if (tracker.stableCount >= requiredFrames) {
                  if (!recentCheckInsRef.current.has(label) && !isProcessingRef.current) {
                    recentCheckInsRef.current.add(label);
                    logCheckIn(label);

                    setTimeout(() => {
                      recentCheckInsRef.current.delete(label);
                    }, 10000);
                  }

                  boxColor = '#00ff00';
                  matchStatus = `✅ ${label} (Liveness ผ่าน!)`;
                  currentStatus = 'ยืนยันตัวตนสำเร็จ';
                } else {
                  matchStatus = `⏳ ${label} (${tracker.stableCount}/${requiredFrames})`;
                  currentStatus = `กำลังยืนยัน... ${tracker.stableCount}/${requiredFrames}`;
                }
              }
            } else {
              tracker.stableCount = 0;
            }
          } else {
            matchStatus = `❌ ไม่รู้จัก (${distance.toFixed(2)})`;
            currentStatus = 'ไม่พบใบหน้าที่ตรงกับฐานข้อมูล';
            failReason = 'UNKNOWN_FACE';
            failMessage = currentStatus;
            failBestMatch = bestMatch.toString();
          }

          const drawBox = new faceapi.draw.DrawBox(box, {
            label: matchStatus || bestMatch.toString(),
            boxColor
          });
          drawBox.draw(canvasRef.current);

        } else if (isInZone && !isCloseEnough) {
          currentStatus = 'กรุณาขยับหน้าเข้ามาใกล้กล้องอีก';
          failReason = 'TOO_FAR';
          failMessage = currentStatus;
          context!.strokeStyle = 'yellow';
          context!.strokeRect(box.x, box.y, box.width, box.height);
        } else if (!isInZone) {
          currentStatus = 'กรุณาวางใบหน้าในกรอบ';
          failReason = 'OUT_OF_ZONE';
          failMessage = currentStatus;
        }
      });

      // ลบ trackers ที่หายไปจากเฟรม
      for (const [label] of faceTrackersRef.current) {
        if (!labelsInThisFrame.has(label)) {
          const tracker = faceTrackersRef.current.get(label);
          if (tracker) {
            tracker.stableCount = Math.floor(tracker.stableCount / 2);
            if (tracker.stableCount <= 0) {
              faceTrackersRef.current.delete(label);
            }
          }
        }
      }

      if (detections.length === 0) {
        currentStatus = "";
        failReason = 'NO_FACE';
        failMessage = 'ไม่พบใบหน้า (ขยับเข้ามาในกรอบ)';
        faceTrackersRef.current.clear();
        setLivenessInfo('');
      }

      setDistanceStatus(currentStatus);

      if (!foundValidFace && failReason) {
        logScanFail(failReason, failMessage, failBestMatch);
      }

    }, 150);
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 text-white p-4">
      <h1 className="text-3xl font-bold mb-4 text-cyan-400">ระบบลงเวลา (Liveness Detection)</h1>

      <div className="relative border-4 border-slate-700 rounded-lg overflow-hidden shadow-2xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onPlay={handleVideoPlay}
          width="640"
          height="480"
          className="scale-x-[-1]"
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 scale-x-[-1]"
        />
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <p className="text-lg text-gray-300">{status}</p>

        {livenessInfo && (
          <p className="text-sm text-purple-400 font-medium bg-purple-900/30 px-4 py-2 rounded-full">
            🔐 Liveness: {livenessInfo}
          </p>
        )}

        {distanceStatus && (
          <p className={`text-xl font-bold animate-pulse ${distanceStatus === 'ยืนยันตัวตนสำเร็จ' ? 'text-green-400' : 'text-yellow-400'}`}>
            {distanceStatus}
          </p>
        )}

        {lastCheckIn && (
          <div className="bg-green-600 text-white px-6 py-3 rounded-xl animate-bounce mt-4 shadow-lg">
            ✅ บันทึกสำเร็จ: <span className="font-bold text-xl">{lastCheckIn}</span>
          </div>
        )}
      </div>

      <div className="mt-8 flex gap-4">
        <Link href="/" className="text-gray-400 hover:text-white underline text-sm transition-colors">
          ไปหน้าลงทะเบียน
        </Link>
        <Link href="/login" className="text-gray-400 hover:text-white underline text-sm transition-colors">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );
}
