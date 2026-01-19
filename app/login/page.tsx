'use client';
import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: email/password, 2: face verify
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [status, setStatus] = useState('กำลังโหลดระบบ...');
  const [loadingModel, setLoadingModel] = useState(true);
  const [matchedUser, setMatchedUser] = useState<any>(null);

  // ค่ากำหนดสำหรับตรวจระยะ
  const MIN_FACE_WIDTH = 180; // ขนาดใบหน้าขั้นต่ำ (ยิ่งมากยิ่งต้องใกล้)

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
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
      setMatchedUser(user);
      const descriptor = new Float32Array(user.descriptor);
      const labeledDescriptor = new faceapi.LabeledFaceDescriptors(user.email, [descriptor]);
      // Threshold สูงขึ้นเพื่อรองรับการใส่แมส (ยอมให้คลาดเคลื่อนมากขึ้น)
      faceMatcherRef.current = new faceapi.FaceMatcher([labeledDescriptor], 0.7);

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

    stopDetection();

    intervalRef.current = setInterval(async () => {
      if (video.paused || video.ended || video.readyState !== 4) return;

      const detection = await faceapi
        .detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const context = canvas.getContext('2d');
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);

      if (!detection) {
        setStatus('❌ ไม่พบใบหน้า (ขยับเข้ามาในกรอบ)');
        return;
      }

      // --- ตรวจระยะใบหน้า ---
      const box = detection.detection.box;
      const isCloseEnough = box.width >= MIN_FACE_WIDTH;
      if (!isCloseEnough) {
        setStatus('🟠 กรุณาขยับหน้าเข้ามาใกล้กล้อง');
        return;
      }

      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawDetections(canvas, resized);

      const bestMatch = faceMatcherRef.current.findBestMatch(detection.descriptor);
      if (bestMatch.label !== 'unknown') {
        setStatus('✅ ยืนยันตัวตนสำเร็จ');
        stopDetection();
        stopVideo();
        localStorage.setItem('currentUser', JSON.stringify(matchedUser));
        setTimeout(() => router.push('/home'), 500);
      } else {
        setStatus('❌ ใบหน้าไม่ตรงกับบัญชีนี้');
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
              ยังไม่มีบัญชี? <a className="text-blue-600 hover:underline" href="/">ลงทะเบียน</a>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-inner">
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
