'use client';
import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import Link from 'next/link';

type FaceUser = {
  name: string;
  surname: string;
  descriptor: number[];
};

export default function CheckIn() {
  const [status, setStatus] = useState('กำลังโหลดระบบ...');
  const [distanceStatus, setDistanceStatus] = useState<string>(''); 
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const usersRef = useRef<FaceUser[]>([]);
  
  // ตัวแปรกันบันทึกซ้ำ (Cooldown)
  const isProcessingRef = useRef(false);
  const lastLoggedNameRef = useRef<string | null>(null);
  const lastFailReasonRef = useRef<string | null>(null);
  const lastFailAtRef = useRef(0);

  // ค่ากำหนดสำหรับโซนและการตรวจจับ
  const ZONE_SIZE = 300; // ขนาดของกรอบสี่เหลี่ยมเป้าหมาย
  const MIN_FACE_WIDTH = 180; // ขนาดใบหน้าขั้นต่ำ (ยิ่งมากยิ่งต้องใกล้)

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

  // 1. โหลด Model และ ข้อมูลใบหน้า
  useEffect(() => {
    const loadResources = async () => {
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        // ดึงข้อมูลคนจาก API
        const response = await fetch('/api/faces');
        const users = (await response.json()) as FaceUser[];
        usersRef.current = users;

        if (users.length === 0) {
          setStatus('ไม่พบฐานข้อมูลใบหน้า (กรุณาลงทะเบียนก่อน)');
          return;
        }

        // แปลงข้อมูลเป็น LabeledFaceDescriptors
        const labeledDescriptors = users.map((user) => {
          const descriptor = new Float32Array(user.descriptor);
          return new faceapi.LabeledFaceDescriptors(`${user.name} ${user.surname}`, [descriptor]);
        });

        // สร้าง Matcher (Threshold 0.5 ช่วยให้ผ่านง่ายขึ้นเวลาใส่แมส)
        faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
        
        setStatus('พร้อมใช้งาน (เข้าสู่ระบบด้วยใบหน้า)');
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

  // 2. ฟังก์ชันบันทึก Log และ Login
  const logCheckIn = async (fullName: string) => {
    // ถ้าเพิ่งบันทึกคนนี้ไปเมื่อกี้ ไม่ต้องบันทึกซ้ำ
    if (lastLoggedNameRef.current === fullName || isProcessingRef.current) return;

    isProcessingRef.current = true; // ล็อค
    try {
        const parts = fullName.split(' ');
        const name = parts[0];
        const surname = parts.slice(1).join(' '); // กรณีมีนามสกุลหลายคำ
        
        // ส่ง API บันทึก Log
        const response = await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, surname, status: 'CHECK_IN' })
        });

        const result = await response.json();

        if (result.alreadyLogged) {
            setStatus(`คุณ ${name} บันทึกไปแล้วเมื่อครู่ (Cooldown 30 นาที)`);
        } else {
            setLastCheckIn(fullName);

            // บันทึก Check-in เท่านั้น
            setStatus('บันทึกเวลาสำเร็จ!');
        }
        
        lastLoggedNameRef.current = fullName;
        
        // Cooldown 5 วินาทีถึงจะตรวจคนเดิมซ้ำได้ (ถ้าไม่ redirect)
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

  // 3. Loop ตรวจจับ
  const handleVideoPlay = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || !faceMatcherRef.current || videoRef.current.paused || videoRef.current.ended) return;

      const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
      if (displaySize.width === 0) return;
      
      faceapi.matchDimensions(canvasRef.current, displaySize);

      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks(true)
        .withFaceDescriptors();

      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      
      if (!canvasRef.current) return;
      const context = canvasRef.current.getContext('2d');
      context?.clearRect(0, 0, displaySize.width, displaySize.height);

      // วาดกรอบเป้าหมาย (Zone) ตรงกลาง
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

      resizedDetections.forEach(result => {
        if (!canvasRef.current) return;
        const { descriptor } = result;
        const box = result.detection.box;
        
        // 1. ตรวจสอบว่าอยู่ตรงกลางโซนหรือไม่
        const faceCenterX = box.x + box.width / 2;
        const faceCenterY = box.y + box.height / 2;
        const isInZone = faceCenterX > zoneX && faceCenterX < zoneX + ZONE_SIZE &&
                         faceCenterY > zoneY && faceCenterY < zoneY + ZONE_SIZE;

        // 2. ตรวจสอบระยะ (ความกว้างของใบหน้า)
        const isCloseEnough = box.width >= MIN_FACE_WIDTH;

        if (isInZone && isCloseEnough) {
          foundValidFace = true;
          const bestMatch = faceMatcherRef.current!.findBestMatch(descriptor);
          
          const drawBox = new faceapi.draw.DrawBox(box, { 
              label: bestMatch.toString(),
              boxColor: bestMatch.label === 'unknown' ? 'red' : '#00ff00'
          });
          drawBox.draw(canvasRef.current);

          if (bestMatch.label !== 'unknown' && !isProcessingRef.current) {
              logCheckIn(bestMatch.label);
              currentStatus = 'ระยะเหมาะสม';
          } else if (bestMatch.label === 'unknown') {
              currentStatus = 'ไม่พบใบหน้าที่ตรงกับฐานข้อมูล';
              failReason = 'UNKNOWN_FACE';
              failMessage = currentStatus;
              failBestMatch = bestMatch.toString();
          } else {
              currentStatus = 'ระยะเหมาะสม';
          }
        } else if (isInZone && !isCloseEnough) {
          currentStatus = 'กรุณาขยับหน้าเข้ามาใกล้กล้องอีก';
          failReason = 'TOO_FAR';
          failMessage = currentStatus;
          // วาดกรอบสีเหลืองเตือนว่าไกลไป
          context!.strokeStyle = 'yellow';
          context!.strokeRect(box.x, box.y, box.width, box.height);
        } else if (!isInZone) {
          currentStatus = 'กรุณาวางใบหน้าในกรอบ';
          failReason = 'OUT_OF_ZONE';
          failMessage = currentStatus;
        }
      });

      if (detections.length === 0) {
        currentStatus = "";
        failReason = 'NO_FACE';
        failMessage = 'ไม่พบใบหน้า (ขยับเข้ามาในกรอบ)';
      }
      
      setDistanceStatus(currentStatus);

      if (!foundValidFace && failReason) {
        logScanFail(failReason, failMessage, failBestMatch);
      }

    }, 200); // ตรวจทุก 200ms
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 text-white p-4">
      <h1 className="text-3xl font-bold mb-4 text-cyan-400">ระบบลงเวลา (รองรับ Mask)</h1>
      
      <div className="relative border-4 border-slate-700 rounded-lg overflow-hidden shadow-2xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onPlay={handleVideoPlay}
          width="640"
          height="480"
          className="scale-x-[-1]" // กลับด้านเหมือนกระจก
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 scale-x-[-1]"
        />
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
         <p className="text-lg text-gray-300">{status}</p>
         
         {distanceStatus && (
            <p className={`text-xl font-bold animat-pulse ${distanceStatus === 'ระยะเหมาะสม' ? 'text-green-400' : 'text-yellow-400'}`}>
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
      </div>
    </div>
  );
}
