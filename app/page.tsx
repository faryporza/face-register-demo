'use client';
import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';

export default function Home() {
  const [step, setStep] = useState(1); // 1: กรอกข้อมูล, 2: สแกนหน้า
  const [subStep, setSubStep] = useState(0); // 0: หน้าตรง, 1: หันซ้าย, 2: หันขวา, 3: พร้อมบันทึก
  const [formData, setFormData] = useState({ prefix: 'นาย', name: '', surname: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [loadingModel, setLoadingModel] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectInterval = useRef<NodeJS.Timeout | null>(null);

  // ค่ากำหนดสำหรับตรวจระยะ
  const MIN_FACE_WIDTH = 180; // ขนาดใบหน้าขั้นต่ำ (ยิ่งมากยิ่งต้องใกล้)

// 1. โหลด Model
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = '/models'; 
      try {
        await Promise.all([
          // ตัวนี้ชื่อถูกแล้ว
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL), 
          
          // *** แก้บรรทัดนี้: เติม Net ต่อท้าย ***
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          
          // *** แก้บรรทัดนี้: เติม Net ต่อท้าย ***
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL) 
        ]);
        console.log('Models Loaded');
        setLoadingModel(false);
      } catch (err) {
        console.error(err);
        setStatus("โหลด Model ไม่ผ่าน (เช็คโฟลเดอร์ public/models)");
      }
    };
    loadModels();

    return () => stopDetection();
  }, []);

  // ฟังก์ชันหยุดการตรวจจับ
  const stopDetection = () => {
    if (detectInterval.current) clearInterval(detectInterval.current);
  };

  // 2. เริ่มเปิดกล้อง
  const startVideo = () => {
    setStatus('กำลังเปิดกล้อง...');
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error(err);
        setStatus('ไม่สามารถเปิดกล้องได้');
      });
  };

  // 3. Logic ตรวจจับใบหน้า + ท่าทาง
  const handleVideoPlay = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    // เคลียร์ Loop เก่าก่อนเริ่มใหม่ป้องกันซ้อนกัน
    stopDetection();

    detectInterval.current = setInterval(async () => {
      // เช็คว่าวิดีโอพร้อมทำงานหรือยัง
      if (video.paused || video.ended || video.readyState !== 4) return;

      // ตรวจจับใบหน้า
      const detections = await faceapi.detectSingleFace(video)
        .withFaceLandmarks();

      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height); // ล้าง Canvas
      }

      if (!detections) {
        setStatus('❌ ไม่พบใบหน้า (ขยับเข้ามาในกรอบ)');
        return;
      }

      // วาดเส้นบนหน้า (Visual Feedback)
      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

      // --- ตรวจระยะใบหน้า ---
      const box = detections.detection.box;
      const isCloseEnough = box.width >= MIN_FACE_WIDTH;
      if (!isCloseEnough) {
        setStatus('🟠 กรุณาขยับหน้าเข้ามาใกล้กล้อง');
        return;
      }

      // --- Logic เช็คหันซ้าย/ขวา ---
      const landmarks = detections.landmarks;
      const nose = landmarks.getNose()[3]; // ปลายจมูก
      const leftEye = landmarks.getLeftEye()[0]; // ตาซ้าย (มุมนอก)
      const rightEye = landmarks.getRightEye()[3]; // ตาขวา (มุมนอก)

      // คำนวณระยะห่างแนวนอน
      const distToLeftEye = Math.abs(nose.x - leftEye.x);
      const distToRightEye = Math.abs(nose.x - rightEye.x);
      
      // อัตราส่วน: ถ้ามองตรง ค่าจะประมาณ 1.0 (เท่ากันซ้ายขวา)
      // ถ้าหัน (mirror): ค่าจะเปลี่ยนไปตามทิศทาง
      const ratio = distToLeftEye / distToRightEye;
      
      // อัพเดทสถานะ (ใช้ state callback เพื่อให้ได้ค่าล่าสุดเสมอ)
      setSubStep((prevStep) => {
           if (prevStep === 0) { // หน้าตรง
             setStatus('🔵 มองหน้าตรงค้างไว้');
             // ยอมรับช่วง 0.8 - 1.2
             if (ratio > 0.8 && ratio < 1.5) return 1; 
             return 0;
        } 
        else if (prevStep === 1) { // รอหัน
             // หันซ้ายหรือขวาก็ได้ ให้ค่า ratio เปลี่ยนไปเยอะๆ
             if (ratio < 0.5) { // หันทางนึง
                setStatus('🟡 เยี่ยม! หันไปอีกทาง');
                return 2;
             }
             if (ratio > 2.0) { // หันอีกทางนึง
                setStatus('🟡 เยี่ยม! หันไปอีกทาง');
                return 2;
             }
             setStatus('🟡 กรุณาหันข้าง (ซ้ายหรือขวา)');
             return 1;
        }
        else if (prevStep === 2) { // รอหันอีกข้าง
            // Logic: ถ้าเมื่อกี้หันซ้าย รอบนี้ต้องหันขวา (หรือกลับมาหน้าตรงก่อนก็ได้)
            // เพื่อความง่าย Demo: แค่กลับมาหน้าตรง หรือหันอีกข้างก็ให้ผ่าน
             if (ratio > 0.7 && ratio < 1.4) {
                 setStatus('✅ ท่าทางครบถ้วน! กดบันทึกได้เลย');
                 return 3;
             }
             return 2;
        }
        return prevStep;
      });

    }, 200); // ตรวจจับทุก 200ms (เร็วขึ้นเพื่อให้ลื่นไหล)
  };

  const handleNext = () => {
    if (!formData.name || !formData.surname || !formData.phone || !formData.email || !formData.password || !formData.confirmPassword) return alert('กรอกข้อมูลให้ครบ');
    if (formData.password !== formData.confirmPassword) return alert('รหัสผ่านไม่ตรงกัน');
    setStep(2);
    setSubStep(0);
    // รอ Video Element render เสร็จแล้วค่อยเปิดกล้อง
    setTimeout(() => startVideo(), 100);
  };

  const handleCaptureAndSave = async () => {
    if (!videoRef.current || isSaving) return;
    setIsSaving(true);
    setStatus('⏳ กำลังบันทึกข้อมูล...');

    try {
        // ตรวจจับครั้งสุดท้ายเพื่อบันทึก Descriptor
        const detection = await faceapi.detectSingleFace(videoRef.current)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            setStatus('❌ ไม่พบใบหน้าขณะบันทึก');
            setIsSaving(false);
            return;
        }

        const descriptorArray = Array.from(detection.descriptor);

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
                descriptor: descriptorArray
            })
        });

        const result = await response.json();
        if (result.success) {
            alert('บันทึกข้อมูลสำเร็จ!');
            window.location.reload();
        } else {
            setStatus('Error: ' + result.message);
        }
    } catch (err) {
        console.error(err);
        setStatus('เกิดข้อผิดพลาด');
    }
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 text-white p-4">
      <div className="bg-white text-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden">
        
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">ลงทะเบียนใบหน้า</h1>

        {/* STEP 1: Form */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">คำนำหน้าหน้า</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล <span className="text-red-500">*</span></label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน <span className="text-red-500">*</span></label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่าน <span className="text-red-500">*</span></label>
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
            
            {/* Camera Wrapper */}
            <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-inner group">
                {/* 1. Video */}
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    onPlay={handleVideoPlay}
                    className="absolute w-full h-full object-cover scale-x-[-1]" 
                />
                
                {/* 2. Canvas (วาดเส้นหน้า) */}
                <canvas 
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full scale-x-[-1]"
                />

                {/* 3. Face Frame (กรอบหน้า) */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* กรอบวงรีสำหรับเล็งหน้า */}
                    <div className={`w-[220px] h-[300px] border-4 rounded-[50%] transition-colors duration-300 shadow-[0_0_100px_rgba(0,0,0,0.5)_inset]
                        ${subStep === 3 ? 'border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.5)]' : 'border-blue-400/70 border-dashed'}
                    `}></div>
                </div>

                {/* Status Text Overlay */}
                <div className="absolute bottom-4 left-0 right-0 text-center px-4">
                     <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
                        {status}
                     </span>
                </div>
            </div>

            {/* Progress Dots */}
            <div className="flex gap-2">
                {[0, 1, 2, 3].map((s) => (
                    <div key={s} className={`h-2 w-2 rounded-full transition-all ${subStep >= s ? 'bg-blue-600 w-6' : 'bg-gray-300'}`} />
                ))}
            </div>
            
            <button
              onClick={handleCaptureAndSave}
              disabled={subStep < 3 || isSaving}
              className={`w-full py-3 rounded-lg font-bold text-lg shadow-lg transition-all
                ${subStep === 3 
                    ? 'bg-green-600 text-white hover:bg-green-700 hover:scale-[1.02]' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
            >
              {isSaving ? 'กำลังบันทึก...' : '📷 บันทึกใบหน้า'}
            </button>
            
            <button 
              onClick={() => {
                stopDetection();
                setStep(1);
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