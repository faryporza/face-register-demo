'use client';
import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  detectHeadTurn,
  isFacingStraight,
} from '@/lib/livenessDetection';
import { loadFaceModels } from '@/lib/faceApi';

type MatchedUser = {
  email?: string;
  descriptor?: number[];
  [key: string]: unknown;
};

// Liveness Steps: 0=turn, 1=face_verify, 2=completed
type LivenessStep = 0 | 1 | 2;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: email/password, 2: liveness + face verify
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [status, setStatus] = useState('กำลังโหลดระบบ...');
  const [loadingModel, setLoadingModel] = useState(true);

  // Liveness Detection State
  const [livenessStep, setLivenessStep] = useState<LivenessStep>(0);
  const livenessStepRef = useRef<LivenessStep>(0); // ใช้ ref คู่กับ state เพื่อแก้ closure issue
  const [turnDirection, setTurnDirection] = useState<'left' | 'right'>('left');

  // ค่ากำหนดสำหรับตรวจระยะ


  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stableCountRef = useRef(0);
  const matchedUserRef = useRef<MatchedUser | null>(null);
  const lastFailReasonRef = useRef<string | null>(null);
  const lastFailAtRef = useRef(0);

  // Thresholds สำหรับ Face Match
  const THRESHOLD_STRICT = 0.42;
  const THRESHOLD_NORMAL = 0.52;
  const THRESHOLD_MASK = 0.60;
  const STABLE_STRICT = 4;
  const STABLE_NORMAL = 8;
  const STABLE_MASK = 12;

  const DETECTOR_INPUT_SIZE = 192;
  const DETECTOR_SCORE_THRESHOLD = 0.4;
  const ZONE_W = 220;
  const ZONE_H = 300;

  const stopDetection = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const stopVideo = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const resetLivenessState = () => {
    setLivenessStep(0);
    livenessStepRef.current = 0;
    stableCountRef.current = 0;
    // สุ่มทิศทางหัน
    setTurnDirection(Math.random() > 0.5 ? 'left' : 'right');
  };

  useEffect(() => {
    const initModels = async () => {
      try {
        await loadFaceModels();
        setLoadingModel(false);
        setStatus('กรอกอีเมลและรหัสผ่าน');
      } catch (err) {
        console.error(err);
        setStatus('โหลด Model ไม่ผ่าน (เช็คโฟลเดอร์ public/models)');
      }
    };

    initModels();

    return () => {
      stopDetection();
      stopVideo();
    };
  }, []);

  const startVideo = () => {
    setStatus('กำลังเปิดกล้อง...');
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error(err);
        setStatus('ไม่สามารถเปิดกล้องได้');
      });
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
          eventType: 'LOGIN_SCAN_FAIL',
          reason,
          distanceStatus: message,
          bestMatch,
          source: 'login',
          email: (matchedUserRef.current?.email || formData.email || '').trim().toLowerCase()
        })
      });
    } catch (error) {
      console.error('Login scan fail log error', error);
    }
  };

  const logScanSuccess = async () => {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'LOGIN_SCAN_SUCCESS',
          source: 'login',
          livenessVerified: true,
          email: (matchedUserRef.current?.email || formData.email || '').trim().toLowerCase()
        })
      });
    } catch (error) {
      console.error('Login scan success log error', error);
    }
  };

  const handleLogin = async () => {
    if (!formData.email || !formData.password) return alert('กรอกข้อมูลให้ครบ');

    try {
      setStatus('กำลังตรวจสอบบัญชี...');
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, password: formData.password })
      });

      const result = await response.json();
      if (!result.success) {
        setStatus('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        alert('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        return;
      }

      const user = result.user;
      matchedUserRef.current = user;
      const descriptor = new Float32Array(user.descriptor);
      const labeledDescriptor = new faceapi.LabeledFaceDescriptors(user.email, [descriptor]);
      faceMatcherRef.current = new faceapi.FaceMatcher([labeledDescriptor], 1.0);

      resetLivenessState();
      setStep(2);
      const dirText = turnDirection === 'left' ? 'ซ้าย' : 'ขวา';
      setStatus(`👆 กรุณาหันหน้าไปทาง${dirText}`);
      setTimeout(() => startVideo(), 100);
    } catch (err) {
      console.error(err);
      setStatus('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
  };

  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current || !faceMatcherRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    const zoneX = (displaySize.width - ZONE_W) / 2;
    const zoneY = (displaySize.height - ZONE_H) / 2;

    const isInZone = (box: faceapi.Box) => {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      return cx > zoneX && cx < zoneX + ZONE_W && cy > zoneY && cy < zoneY + ZONE_H;
    };

    stopDetection();

    intervalRef.current = setInterval(async () => {
      if (video.paused || video.ended || video.readyState !== 4) return;

      const options = new faceapi.SsdMobilenetv1Options({
        minConfidence: DETECTOR_SCORE_THRESHOLD,
      });

      const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const context = canvas.getContext('2d');
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);

      if (!detection) {
        setStatus('❌ ไม่พบใบหน้า (ขยับเข้ามาในกรอบ)');
        return;
      }

      const box = detection.detection.box;
      const minFaceWidth = displaySize.width * 0.22; // 22% of video width
      const isCloseEnough = box.width >= minFaceWidth;
      if (!isCloseEnough) {
        setStatus('🟠 กรุณาขยับหน้าเข้ามาใกล้กล้อง');
        return;
      }

      if (!isInZone(box)) {
        setStatus('🟥 กรุณาอยู่ในกรอบกลาง');
        return;
      }

      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawFaceLandmarks(canvas, resized);

      const landmarks = detection.landmarks;

      // ===== LIVENESS STEP 0: Head Turn Detection =====
      if (livenessStepRef.current === 0) {
        const isTurned = detectHeadTurn(landmarks, turnDirection);
        const dirText = turnDirection === 'left' ? 'ซ้าย' : 'ขวา';

        if (isTurned) {
          livenessStepRef.current = 1;
          setLivenessStep(1);
          stableCountRef.current = 0;
          setStatus('✅ ดี! กรุณากลับมามองตรงเพื่อยืนยันใบหน้า');
        } else {
          setStatus(`👆 กรุณาหันหน้าไปทาง${dirText}`);
        }
        return;
      }

      // ===== LIVENESS STEP 1: Face Verification (ต้องหันกลับมาหน้าตรง) =====
      if (livenessStepRef.current === 1) {
        if (!isFacingStraight(landmarks)) {
          setStatus('🔵 กรุณากลับมามองหน้าตรง');
          stableCountRef.current = 0;
          return;
        }

        const matcher = faceMatcherRef.current;
        if (!matcher) return;
        const bestMatch = matcher.findBestMatch(detection.descriptor);
        const distance = bestMatch.distance;

        console.log(`[LOGIN] Face match: ${bestMatch.label}, distance: ${distance.toFixed(3)}`);

        if (bestMatch.label !== 'unknown') {
          let requiredFrames: number;
          let statusIcon: string;

          if (distance < THRESHOLD_STRICT) {
            requiredFrames = STABLE_STRICT;
            statusIcon = '🟢';
          } else if (distance < THRESHOLD_NORMAL) {
            requiredFrames = STABLE_NORMAL;
            statusIcon = '🟡';
          } else if (distance < THRESHOLD_MASK) {
            requiredFrames = STABLE_MASK;
            statusIcon = '🟠';
          } else {
            stableCountRef.current = 0;
            setStatus(`⚠️ ใบหน้าไม่ตรงกับบัญชี [${distance.toFixed(2)}]`);
            logScanFail('LOW_CONFIDENCE', `ใบหน้าไม่ตรง (distance: ${distance.toFixed(3)})`, bestMatch.toString());
            return;
          }

          stableCountRef.current += 1;

          if (stableCountRef.current < requiredFrames) {
            setStatus(`${statusIcon} กำลังยืนยัน... (${stableCountRef.current}/${requiredFrames}) [${distance.toFixed(2)}]`);
            return;
          }

          // SUCCESS!
          livenessStepRef.current = 2;
          setLivenessStep(2);
          setStatus('✅ ยืนยันตัวตนสำเร็จ!');
          logScanSuccess();
          stopDetection();
          stopVideo();
          localStorage.setItem('currentUser', JSON.stringify(matchedUserRef.current));
          setTimeout(() => router.push('/home'), 800);
        } else {
          stableCountRef.current = 0;
          setStatus(`❌ ใบหน้าไม่ตรงกับบัญชีนี้ [${distance.toFixed(2)}]`);
          logScanFail('UNKNOWN_FACE', `ใบหน้าไม่ตรง (distance: ${distance.toFixed(3)})`, bestMatch.toString());
        }
      }
    }, 250);
  };

  // Get border color based on liveness step
  const getBorderClass = () => {
    if (livenessStep === 2 || status.includes('✅ ยืนยันตัวตนสำเร็จ')) {
      return 'border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.5)]';
    }
    if (livenessStep === 1) {
      return 'border-blue-400 border-solid';
    }
    return 'border-yellow-400 border-dashed'; // turn stage
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 text-white p-4">
      <div className="bg-white text-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">เข้าสู่ระบบ</h1>

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
              <input
                type="email"
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="example@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
              <input
                type="password"
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="รหัสผ่านของคุณ"
                required
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={loadingModel}
              className="mt-2 w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              {loadingModel ? 'กำลังโหลด AI...' : 'ถัดไป (ยืนยันใบหน้า)'}
            </button>

            <div className="text-center text-sm text-gray-500">
              ยังไม่มีบัญชี? <Link className="text-blue-600 hover:underline" href="/">ลงทะเบียน</Link>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-4">
            {/* Liveness Progress Indicator */}
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${livenessStep >= 0 ? 'bg-yellow-500 text-white' : 'bg-gray-300'}`}>
                {turnDirection === 'left' ? '👈' : '👉'}
              </div>
              <div className={`w-8 h-1 ${livenessStep >= 1 ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${livenessStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-300'}`}>
                🔵
              </div>
              <div className={`w-8 h-1 ${livenessStep >= 2 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${livenessStep >= 2 ? 'bg-green-500 text-white' : 'bg-gray-300'}`}>
                ✅
              </div>
            </div>

            <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-inner group">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                onPlay={handleVideoPlay}
                className="absolute w-full h-full object-cover scale-x-[-1]"
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full scale-x-[-1]"
              />

              {/* Face Frame */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`w-[220px] h-[300px] border-4 rounded-[50%] transition-colors duration-300 shadow-[0_0_100px_rgba(0,0,0,0.5)_inset] ${getBorderClass()}`}></div>
              </div>

              <div className="absolute bottom-4 left-0 right-0 text-center px-4">
                <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
                  {status}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                stopDetection();
                stopVideo();
                setStep(1);
                setStatus('กรอกอีเมลและรหัสผ่าน');
                resetLivenessState();
              }}
              className="text-gray-500 text-sm hover:underline"
            >
              ย้อนกลับ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
