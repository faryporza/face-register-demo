'use client';
import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { useRouter } from 'next/navigation';

export default function CheckIn() {
  const router = useRouter();
  const [status, setStatus] = useState('กำลังโหลดระบบ...');
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const usersRef = useRef<any[]>([]);
  
  // ตัวแปรกันบันทึกซ้ำ (Cooldown)
  const isProcessingRef = useRef(false);
  const lastLoggedNameRef = useRef<string | null>(null);

  // 1. โหลด Model และ ข้อมูลใบหน้า
  useEffect(() => {
    const loadResources = async () => {
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        // ดึงข้อมูลคนจาก API
        const response = await fetch('/api/faces');
        const users = await response.json();
        usersRef.current = users;

        if (users.length === 0) {
          setStatus('ไม่พบฐานข้อมูลใบหน้า (กรุณาลงทะเบียนก่อน)');
          return;
        }

        // แปลงข้อมูลเป็น LabeledFaceDescriptors
        const labeledDescriptors = users.map((user: any) => {
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

  // 2. ฟังก์ชันบันทึก Log และ Login
  const logCheckIn = async (fullName: string) => {
    // ถ้าเพิ่งบันทึกคนนี้ไปเมื่อกี้ ไม่ต้องบันทึกซ้ำ
    if (lastLoggedNameRef.current === fullName || isProcessingRef.current) return;

    isProcessingRef.current = true; // ล็อค
    try {
        const parts = fullName.split(' ');
        const name = parts[0];
        const surname = parts.slice(1).join(' '); // กรณีมีนามสกุลหลายคำ
        
        // ค้นหาข้อมูลผู้ใช้เต็มรูปแบบ
        const user = usersRef.current.find(u => u.name === name && u.surname === surname);
        
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

            // ถ้าเป็น Admin ให้ Login และ Redirect
            if (user && user.type === 'admin') {
              localStorage.setItem('currentUser', JSON.stringify(user));
              setStatus('ยืนยันตัวตนสำเร็จ (Admin)! กำลังเข้าสู่หน้าหลัก...');
              setTimeout(() => {
                router.push('/home');
              }, 1500);
            } else {
              // ถ้าไม่ใช่ Admin ให้แค่บันทึก Check-in
              setStatus('บันทึกเวลาสำเร็จ!');
            }
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

  // 3. Loop ตรวจจับ
  const handleVideoPlay = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || !faceMatcherRef.current || videoRef.current.paused || videoRef.current.ended) return;

      const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
      if (displaySize.width === 0) return;
      
      faceapi.matchDimensions(canvasRef.current, displaySize);

      // detectAllFaces จะจับได้ดีกว่า SingleFace กรณีมีสิ่งปิดบัง
      const detections = await faceapi.detectAllFaces(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptors();

      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      
      if (!canvasRef.current) return;
      const context = canvasRef.current.getContext('2d');
      context?.clearRect(0, 0, displaySize.width, displaySize.height);

      resizedDetections.forEach(result => {
        if (!canvasRef.current) return;
        const { descriptor } = result;
        const bestMatch = faceMatcherRef.current!.findBestMatch(descriptor);
        
        // วาดกรอบ
        const box = result.detection.box;
        const drawBox = new faceapi.draw.DrawBox(box, { 
            label: bestMatch.toString(),
            boxColor: bestMatch.label === 'unknown' ? 'red' : 'green'
        });
        drawBox.draw(canvasRef.current);

        // ถ้าเจอคนที่รู้จัก และไม่อยู่ในช่วง Cooldown -> บันทึก Log
        if (bestMatch.label !== 'unknown' && !isProcessingRef.current) {
            logCheckIn(bestMatch.label);
        }
      });

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
         
         {lastCheckIn && (
            <div className="bg-green-600 text-white px-6 py-3 rounded-xl animate-bounce mt-4 shadow-lg">
                ✅ บันทึกสำเร็จ: <span className="font-bold text-xl">{lastCheckIn}</span>
            </div>
         )}
      </div>

      <div className="mt-8 flex gap-4">
        <a href="/" className="text-gray-400 hover:text-white underline text-sm transition-colors">
            ไปหน้าลงทะเบียน
        </a>
      </div>
    </div>
  );
}
