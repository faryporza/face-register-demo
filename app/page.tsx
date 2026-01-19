'use client';
import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';

export default function Home() {
  const [step, setStep] = useState(1); // 1: ฟอร์ม, 2: สแกน
  const [subStep, setSubStep] = useState(0); // 0: หน้าตรง, 1: หันข้าง, 2: กลับมาตรง, 3: พร้อมบันทึก
  const [formData, setFormData] = useState({
    prefix: 'นาย',
    name: '',
    surname: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [loadingModel, setLoadingModel] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // -------- Stability (นิ่ง) --------
  const [stableCount, setStableCount] = useState(0);
  const stableCountRef = useRef(0);
  const STABLE_FRAMES_REQUIRED = 6; // 6 เฟรม x 200ms ≈ 1.2s
  const autoSavedRef = useRef(false);

  // เก็บ detection ล่าสุด
  const latestDetectionRef =
    useRef<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectInterval = useRef<NodeJS.Timeout | null>(null);

  // -------- Thresholds --------
  const MIN_FACE_WIDTH = 180; // ใกล้/ไกล
  const DETECTOR_INPUT_SIZE = 192; // มือถือแนะนำ 160-192
  const DETECTOR_SCORE_THRESHOLD = 0.6; // กัน false positive

  // Zone ให้ต้องอยู่กลางวงรีจริง ๆ (อิงกับ UI ที่วาด 220x300)
  const ZONE_W = 220;
  const ZONE_H = 300;

  const stopDetection = () => {
    if (detectInterval.current) clearInterval(detectInterval.current);
    detectInterval.current = null;
  };

  const stopVideoStream = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const resetScanState = () => {
    latestDetectionRef.current = null;
    autoSavedRef.current = false;
    stableCountRef.current = 0;
    setStableCount(0);
    setSubStep(0);
    setStatus('');
  };

  // -------- Load models --------
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setLoadingModel(false);
      } catch (err) {
        console.error(err);
        setStatus('โหลด Model ไม่ผ่าน (เช็คโฟลเดอร์ public/models)');
      }
    };

    loadModels();

    return () => {
      stopDetection();
      stopVideoStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Start camera --------
  const startVideo = () => {
    setStatus('กำลังเปิดกล้อง...');
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 } })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        console.error(err);
        setStatus('ไม่สามารถเปิดกล้องได้');
      });
  };

  // -------- Utils: Validation (form) --------
  const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ');
  const isValidThaiEngName = (s: string) => {
    const v = normalizeName(s);
    return /^[A-Za-zก-๙\s-]{2,60}$/.test(v) && v.length >= 2;
  };
  const isValidPhoneTH = (s: string) => {
    const v = s.replace(/\D/g, '');
    return /^0\d{9}$/.test(v);
  };
  const isValidEmail = (s: string) => {
    const v = s.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  };

  const validateForm = () => {
    const name = normalizeName(formData.name);
    const surname = normalizeName(formData.surname);
    const email = formData.email.trim();
    const phone = formData.phone.trim();

    if (!isValidThaiEngName(name)) return 'ชื่อไม่ถูกต้อง (อย่างน้อย 2 ตัวอักษร)';
    if (!isValidThaiEngName(surname)) return 'นามสกุลไม่ถูกต้อง (อย่างน้อย 2 ตัวอักษร)';
    if (!isValidEmail(email)) return 'อีเมลไม่ถูกต้อง';
    if (!isValidPhoneTH(phone)) return 'เบอร์โทรไม่ถูกต้อง (ต้องเป็น 10 หลัก เริ่มด้วย 0)';
    if (formData.password.length < 6) return 'รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร';
    if (formData.password !== formData.confirmPassword) return 'รหัสผ่านไม่ตรงกัน';
    return null;
  };

  const handleNext = () => {
    const err = validateForm();
    if (err) return alert(err);

    setFormData((p) => ({
      ...p,
      name: normalizeName(p.name),
      surname: normalizeName(p.surname),
      email: p.email.trim(),
      phone: p.phone.replace(/\D/g, ''),
    }));

    setStep(2);
    resetScanState();
    setTimeout(() => startVideo(), 100);
  };

  // -------- Face loop --------
  const handleVideoPlay = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    stopDetection();

    detectInterval.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      if (video.paused || video.ended || video.readyState !== 4) return;

      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      if (!displaySize.width || !displaySize.height) return;

      faceapi.matchDimensions(canvas, displaySize);

      // คำนวณ zone กลางภาพ
      const zoneX = (displaySize.width - ZONE_W) / 2;
      const zoneY = (displaySize.height - ZONE_H) / 2;

      const isInZone = (box: faceapi.Box) => {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        return cx > zoneX && cx < zoneX + ZONE_W && cy > zoneY && cy < zoneY + ZONE_H;
      };

      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: DETECTOR_INPUT_SIZE,
        scoreThreshold: DETECTOR_SCORE_THRESHOLD,
      });

      const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks(true);

      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);

      // วาด zone (ให้เห็นจริง ๆ)
      if (ctx) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(zoneX, zoneY, ZONE_W, ZONE_H);
        ctx.setLineDash([]);
      }

      const resetStable = (msg?: string) => {
        latestDetectionRef.current = null;
        stableCountRef.current = 0;
        setStableCount(0);
        if (msg) setStatus(msg);
      };

      if (!detection) {
        resetStable('❌ ไม่พบใบหน้า (ขยับเข้ามาในกรอบ)');
        return;
      }

      const box = detection.detection.box;
      const score = detection.detection.score ?? 1;

      // กันหลุดกรอบ
      if (!isInZone(box)) {
        resetStable('🟥 กรุณาอยู่ในกรอบวงรี/กรอบกลาง');
        return;
      }

      // กันไกล
      if (box.width < MIN_FACE_WIDTH) {
        resetStable('🟠 กรุณาขยับหน้าเข้ามาใกล้กล้อง');
        return;
      }

      // กันภาพไม่ชัด/หลอก
      if (score < DETECTOR_SCORE_THRESHOLD) {
        resetStable('🟠 แสง/มุมไม่ชัด ลองขยับเล็กน้อย');
        return;
      }

      // เก็บ detection ล่าสุด
      latestDetectionRef.current = detection;

      // วาด landmark
      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawFaceLandmarks(canvas, resized);

      // --- Logic หันซ้าย/ขวา ---
      const landmarks = detection.landmarks;
      const nose = landmarks.getNose()[3];
      const leftEye = landmarks.getLeftEye()[0];
      const rightEye = landmarks.getRightEye()[3];

      const distToLeftEye = Math.abs(nose.x - leftEye.x);
      const distToRightEye = Math.abs(nose.x - rightEye.x);
      const ratio = distToLeftEye / distToRightEye;

      setSubStep((prevStep) => {
        let next = prevStep;

        if (prevStep === 0) {
          setStatus('🔵 มองหน้าตรงค้างไว้');
          if (ratio > 0.8 && ratio < 1.5) next = 1;
        } else if (prevStep === 1) {
          if (ratio < 0.5 || ratio > 2.0) {
            setStatus('🟡 เยี่ยม! ตอนนี้กลับมาหน้าตรง');
            next = 2;
          } else {
            setStatus('🟡 กรุณาหันข้าง (ซ้ายหรือขวา)');
          }
        } else if (prevStep === 2) {
          if (ratio > 0.7 && ratio < 1.4) {
            setStatus('✅ ท่าทางครบ! กรุณานิ่งไว้ ระบบจะบันทึกอัตโนมัติ');
            next = 3;
          }
        }

        // นับความนิ่งเฉพาะตอน next=3 และยังอยู่ในเงื่อนไขผ่าน (เราเช็กด้านบนแล้ว)
        if (next === 3) {
          stableCountRef.current = Math.min(stableCountRef.current + 1, STABLE_FRAMES_REQUIRED);
          setStableCount(stableCountRef.current);
        } else {
          stableCountRef.current = 0;
          setStableCount(0);
        }

        return next;
      });
    }, 200);
  };

  // -------- Save (single function used by auto-save) --------
  const handleCaptureAndSave = async () => {
    if (!videoRef.current || isSaving) return;

    // ต้องนิ่งครบจริง (ใช้ ref กัน race)
    if (!latestDetectionRef.current || stableCountRef.current < STABLE_FRAMES_REQUIRED) {
      setStatus('⚠️ กรุณาอยู่ในกรอบและนิ่งไว้ ระบบถึงจะบันทึกได้');
      return;
    }

    setIsSaving(true);
    setStatus('⏳ กำลังบันทึกข้อมูล...');

    try {
      const video = videoRef.current;

      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      const zoneX = (displaySize.width - ZONE_W) / 2;
      const zoneY = (displaySize.height - ZONE_H) / 2;
      const isInZone = (box: faceapi.Box) => {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        return cx > zoneX && cx < zoneX + ZONE_W && cy > zoneY && cy < zoneY + ZONE_H;
      };

      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: DETECTOR_INPUT_SIZE,
        scoreThreshold: DETECTOR_SCORE_THRESHOLD,
      });

      // ตรวจซ้ำตอนบันทึกจริง (กันหลุด)
      const det = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!det) {
        setStatus('❌ ไม่พบใบหน้าขณะบันทึก (อย่าเพิ่งเอาหน้าออก)');
        setIsSaving(false);
        autoSavedRef.current = false; // ให้ลองใหม่ได้
        return;
      }

      const score = det.detection.score ?? 1;
      if (score < DETECTOR_SCORE_THRESHOLD) {
        setStatus('🟠 ภาพไม่ชัด/แสงไม่พอ ลองใหม่');
        setIsSaving(false);
        autoSavedRef.current = false;
        return;
      }

      if (!isInZone(det.detection.box)) {
        setStatus('🟥 กรุณาอยู่ในกรอบก่อนบันทึก');
        setIsSaving(false);
        autoSavedRef.current = false;
        return;
      }

      if (det.detection.box.width < MIN_FACE_WIDTH) {
        setStatus('🟠 ใกล้กล้องอีกนิดก่อนบันทึก');
        setIsSaving(false);
        autoSavedRef.current = false;
        return;
      }

      const descriptorArray = Array.from(det.descriptor);

      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: formData.prefix,
          name: formData.name,
          surname: formData.surname,
          phone: formData.phone,
          email: formData.email,
          password: formData.password,
          descriptor: descriptorArray,
        }),
      });

      const result = await response.json();

      if (result.success) {
        stopDetection();
        stopVideoStream();
        alert('บันทึกข้อมูลสำเร็จ!');
        window.location.href = '/login';
        return;
      } else {
        setStatus('Error: ' + (result.message || 'บันทึกไม่สำเร็จ'));
        autoSavedRef.current = false; // ให้ลองใหม่ได้
      }
    } catch (err) {
      console.error(err);
      setStatus('เกิดข้อผิดพลาด');
      autoSavedRef.current = false;
    } finally {
      setIsSaving(false);
    }
  };

  // -------- Auto-save when stable complete --------
  useEffect(() => {
    if (step !== 2) return;
    if (subStep !== 3) return;
    if (stableCount < STABLE_FRAMES_REQUIRED) return;
    if (isSaving) return;

    if (autoSavedRef.current) return;
    autoSavedRef.current = true;

    // ยิงบันทึกอัตโนมัติ
    handleCaptureAndSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, subStep, stableCount, isSaving]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 text-white p-4">
      <div className="bg-white text-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">ลงทะเบียนใบหน้า</h1>

        {/* STEP 1: Form */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">คำนำหน้า</label>
              <select
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
              >
                <option value="นาย">นาย</option>
                <option value="นางสาว">นางสาว</option>
                <option value="นาง">นาง</option>
                <option value="เด็กชาย">เด็กชาย</option>
                <option value="เด็กหญิง">เด็กหญิง</option>
              </select>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อจริง</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">นามสกุล</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.surname}
                  onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
              <input
                type="tel"
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="08X-XXX-XXXX"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                อีเมล <span className="text-red-500">*</span>
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัสผ่าน <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pr-12"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pr-12"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="ยืนยันรหัสผ่านอีกครั้ง"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>
            </div>

            <button
              onClick={handleNext}
              disabled={loadingModel}
              className="mt-2 w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              {loadingModel ? 'กำลังโหลด AI...' : 'เริ่มต้นสแกน'}
            </button>

            <div className="text-center text-sm text-gray-500">
              มีบัญชีแล้ว? <a className="text-blue-600 hover:underline" href="/login">เข้าสู่ระบบ</a>
            </div>
          </div>
        )}

        {/* STEP 2: Scan */}
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

              <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full scale-x-[-1]" />

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-[220px] h-[300px] border-4 rounded-[50%] transition-colors duration-300 shadow-[0_0_100px_rgba(0,0,0,0.5)_inset]
                    ${
                      subStep === 3
                        ? 'border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.5)]'
                        : 'border-blue-400/70 border-dashed'
                    }`}
                />
              </div>

              <div className="absolute bottom-4 left-0 right-0 text-center px-4">
                <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
                  {status}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 w-full mt-2">
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`h-2 w-2 rounded-full transition-all ${subStep >= s ? 'bg-blue-600 w-6' : 'bg-gray-300'}`}
                  />
                ))}
              </div>

              {subStep === 3 && stableCount < STABLE_FRAMES_REQUIRED && (
                <p className="text-sm text-blue-600 animate-pulse font-medium">
                  กำลังเตรียมบันทึกอัตโนมัติ... ({stableCount}/{STABLE_FRAMES_REQUIRED})
                </p>
              )}

              {subStep === 3 && stableCount >= STABLE_FRAMES_REQUIRED && (
                <p className="text-sm text-green-600 font-semibold">กำลังบันทึกให้อัตโนมัติ…</p>
              )}
            </div>

            {/* ปุ่มบันทึกซ่อน (Auto-save) */}
            <div className="w-full py-3 rounded-lg font-bold text-lg bg-green-50 text-green-700 text-center border border-green-200">
              ระบบจะบันทึกให้อัตโนมัติเมื่อคุณนิ่งครบ {STABLE_FRAMES_REQUIRED} ครั้ง
            </div>

            <button
              onClick={() => {
                stopDetection();
                stopVideoStream();
                setStep(1);
                resetScanState();
              }}
              className="text-gray-500 text-sm hover:underline"
              disabled={isSaving}
            >
              ย้อนกลับ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
