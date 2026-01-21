'use client';
import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type MatchedUser = {
  email?: string;
  descriptor?: number[];
  [key: string]: unknown;
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: email/password, 2: face verify
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [status, setStatus] = useState('กำลังโหลดระบบ...');
  const [loadingModel, setLoadingModel] = useState(true);

  // ค่ากำหนดสำหรับตรวจระยะ
  const MIN_FACE_WIDTH = 180; // ขนาดใบหน้าขั้นต่ำ (ยิ่งมากยิ่งต้องใกล้)

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const matchCountRef = useRef(0);
  const stableCountRef = useRef(0);
  const lastMatchLabelRef = useRef<string | null>(null);
  const matchedUserRef = useRef<MatchedUser | null>(null);
  const lastFailReasonRef = useRef<string | null>(null);
  const lastFailAtRef = useRef(0);

  // === Adaptive Threshold สำหรับ Login (เข้มงวดกว่า Check-in) ===
  const THRESHOLD_STRICT = 0.38;   // ถ้า distance < นี้ = แม่นมาก ผ่านเร็ว
  const THRESHOLD_NORMAL = 0.45;   // ถ้า distance < นี้ = ต้องยืนยันมากขึ้น
  // ถ้า distance >= THRESHOLD_NORMAL = ไม่ผ่าน

  const STABLE_STRICT = 5;    // เฟรมที่ต้องติดต่อกัน (ถ้า distance ต่ำมาก)
  const STABLE_NORMAL = 9;    // เฟรมที่ต้องติดต่อกัน (ถ้า distance ปานกลาง)

  const DETECTOR_INPUT_SIZE = 192; // มือถือ 160-192
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

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        setLoadingModel(false);
        setStatus('กรอกอีเมลและรหัสผ่าน');
      } catch (err) {
        console.error(err);
        setStatus('โหลด Model ไม่ผ่าน (เช็คโฟลเดอร์ public/models)');
      }
    };

    loadModels();

    return () => {
      stopDetection();
      stopVideo();
    };
  }, []);

  const startVideo = () => {
    setStatus('กำลังเปิดกล้อง...');
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 } })
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
      // Threshold 0.48 รองรับแมส แต่ใช้ Adaptive Check ภายหลัง
      faceMatcherRef.current = new faceapi.FaceMatcher([labeledDescriptor], 0.48);
      matchCountRef.current = 0;
      stableCountRef.current = 0;
      lastMatchLabelRef.current = null;

      setStep(2);
      setStatus('กรุณามองกล้องเพื่อยืนยันใบหน้า');
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

      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: DETECTOR_INPUT_SIZE,
        scoreThreshold: DETECTOR_SCORE_THRESHOLD,
      });

      const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      const context = canvas.getContext('2d');
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);

      if (!detection) {
        stableCountRef.current = 0;
        matchCountRef.current = 0;
        setStatus('❌ ไม่พบใบหน้า (ขยับเข้ามาในกรอบ)');
        logScanFail('NO_FACE', 'ไม่พบใบหน้า (ขยับเข้ามาในกรอบ)');
        return;
      }

      // --- ตรวจระยะใบหน้า ---
      const box = detection.detection.box;
      const isCloseEnough = box.width >= MIN_FACE_WIDTH;
      if (!isCloseEnough) {
        stableCountRef.current = 0;
        matchCountRef.current = 0;
        setStatus('🟠 กรุณาขยับหน้าเข้ามาใกล้กล้อง');
        logScanFail('TOO_FAR', 'กรุณาขยับหน้าเข้ามาใกล้กล้อง');
        return;
      }

      // --- ตรวจ Zone ---
      if (!isInZone(box)) {
        stableCountRef.current = 0;
        matchCountRef.current = 0;
        setStatus('🟥 กรุณาอยู่ในกรอบกลาง');
        logScanFail('OUT_OF_ZONE', 'กรุณาอยู่ในกรอบกลาง');
        return;
      }

      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawFaceLandmarks(canvas, resized);

      const matcher = faceMatcherRef.current;
      if (!matcher) return;
      const bestMatch = matcher.findBestMatch(detection.descriptor);
      const distance = bestMatch.distance;

      // Debug: แสดง distance ใน console
      console.log(`[LOGIN] Face match: ${bestMatch.label}, distance: ${distance.toFixed(3)}`);

      // === Adaptive Threshold Logic ===
      if (bestMatch.label !== 'unknown') {
        // กำหนดจำนวนเฟรมที่ต้องการตาม distance
        let requiredFrames: number;
        let statusIcon: string;

        if (distance < THRESHOLD_STRICT) {
          // แม่นมาก - ต้อง 5 เฟรม
          requiredFrames = STABLE_STRICT;
          statusIcon = '🟢';
        } else if (distance < THRESHOLD_NORMAL) {
          // ปานกลาง - ต้อง 9 เฟรม (รองรับแมส)
          requiredFrames = STABLE_NORMAL;
          statusIcon = '🟡';
        } else {
          // ไม่ผ่าน threshold - distance สูงเกินไป
          stableCountRef.current = 0;
          matchCountRef.current = 0;
          lastMatchLabelRef.current = null;
          setStatus(`⚠️ ใบหน้าไม่ชัดเจน [${distance.toFixed(2)}] - ขยับหน้าให้ตรง/ถอดแมส`);
          logScanFail('LOW_CONFIDENCE', `ใบหน้าไม่ชัด (distance: ${distance.toFixed(3)})`, bestMatch.toString());
          return;
        }

        stableCountRef.current += 1;

        if (stableCountRef.current < requiredFrames) {
          setStatus(`${statusIcon} กำลังยืนยัน... (${stableCountRef.current}/${requiredFrames}) [${distance.toFixed(2)}]`);
          return;
        }

        setStatus('✅ ยืนยันตัวตนสำเร็จ');
        logScanSuccess();
        stopDetection();
        stopVideo();
        localStorage.setItem('currentUser', JSON.stringify(matchedUserRef.current));
        setTimeout(() => router.push('/home'), 500);
      } else {
        stableCountRef.current = 0;
        matchCountRef.current = 0;
        lastMatchLabelRef.current = null;
        setStatus(`❌ ใบหน้าไม่ตรงกับบัญชีนี้ [${distance.toFixed(2)}]`);
        logScanFail('UNKNOWN_FACE', `ใบหน้าไม่ตรง (distance: ${distance.toFixed(3)})`, bestMatch.toString());
      }
    }, 200);
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

              {/* Face Frame (กรอบหน้า) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`w-[220px] h-[300px] border-4 rounded-[50%] transition-colors duration-300 shadow-[0_0_100px_rgba(0,0,0,0.5)_inset]
                      ${status.includes('✅') ? 'border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.5)]' : 'border-blue-400/70 border-dashed'}
                  `}></div>
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
