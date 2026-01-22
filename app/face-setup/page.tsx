'use client';
import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { loadFaceModels } from '@/lib/faceApi';
import { useRouter } from 'next/navigation';

export default function FaceSetupPage() {
    const router = useRouter();
    const [loadingModel, setLoadingModel] = useState(true);
    const [status, setStatus] = useState('กำลังโหลดระบบ...');
    const [isSaving, setIsSaving] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Stability
    const [stableCount, setStableCount] = useState(0);
    const stableCountRef = useRef(0);
    const STABLE_FRAMES_REQUIRED = 6;
    const autoSavedRef = useRef(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const detectInterval = useRef<NodeJS.Timeout | null>(null);

    // Constraints
    const MIN_FACE_WIDTH = 180;
    const DETECTOR_SCORE_THRESHOLD = 0.6;
    const ZONE_W = 220;
    const ZONE_H = 300;

    useEffect(() => {
        // Check login
        const stored = localStorage.getItem('currentUser');
        if (!stored) {
            router.push('/login');
            return;
        }
        setCurrentUser(JSON.parse(stored));

        const initModels = async () => {
            try {
                await loadFaceModels();
                setLoadingModel(false);
                setStatus('กำลังเปิดกล้อง...');
                startVideo();
            } catch (err) {
                setStatus('โหลด Model ไม่ผ่าน');
            }
        };
        initModels();

        return () => {
            stopDetection();
            stopVideo();
        };
    }, [router]);

    const startVideo = () => {
        navigator.mediaDevices
            .getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            })
            .then((stream) => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            })
            .catch((err) => {
                setStatus('ไม่สามารถเปิดกล้องได้');
            });
    };

    const stopDetection = () => {
        if (detectInterval.current) clearInterval(detectInterval.current);
    };

    const stopVideo = () => {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        }
    };

    const handleVideoPlay = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        stopDetection();

        detectInterval.current = setInterval(async () => {
            if (video.paused || video.ended || video.readyState !== 4) return;

            const displaySize = { width: video.videoWidth, height: video.videoHeight };
            faceapi.matchDimensions(canvas, displaySize);

            const zoneX = (displaySize.width - ZONE_W) / 2;
            const zoneY = (displaySize.height - ZONE_H) / 2;

            const options = new faceapi.SsdMobilenetv1Options({ minConfidence: DETECTOR_SCORE_THRESHOLD });
            const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks().withFaceDescriptor();

            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);

            // Draw Zone
            if (ctx) {
                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.setLineDash([6, 6]);
                ctx.strokeRect(zoneX, zoneY, ZONE_W, ZONE_H);
                ctx.setLineDash([]);
            }

            if (!detection) {
                stableCountRef.current = 0;
                setStableCount(0);
                setStatus('❌ ไม่พบใบหน้า');
                return;
            }

            const box = detection.detection.box;
            const minFaceWidth = displaySize.width * 0.22;
            const isCloseEnough = box.width >= minFaceWidth;

            // Adaptive Zone Check
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const isInZone = cx > zoneX && cx < zoneX + ZONE_W && cy > zoneY && cy < zoneY + ZONE_H;

            if (!isInZone) {
                stableCountRef.current = 0;
                setStableCount(0);
                setStatus('🟥 กรุณาอยู่ในกรอบกลาง');
                return;
            }

            if (!isCloseEnough) {
                stableCountRef.current = 0;
                setStableCount(0);
                setStatus('🟠 กรุณาขยับหน้าเข้ามาใกล้กล้อง');
                return;
            }

            // Draw
            const resized = faceapi.resizeResults(detection, displaySize);
            faceapi.draw.drawFaceLandmarks(canvas, resized);

            // Stable Check
            stableCountRef.current += 1;
            setStableCount(stableCountRef.current);

            if (stableCountRef.current >= STABLE_FRAMES_REQUIRED && !autoSavedRef.current && !isSaving) {
                autoSavedRef.current = true;
                saveFace(detection.descriptor);
            } else if (stableCountRef.current < STABLE_FRAMES_REQUIRED) {
                setStatus(`🔵 นิ่งไว้... ${stableCountRef.current}/${STABLE_FRAMES_REQUIRED}`);
            }

        }, 250);
    };

    const saveFace = async (descriptor: Float32Array) => {
        setIsSaving(true);
        setStatus('⏳ กำลังบันทึก...');
        try {
            const response = await fetch('/api/face/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: currentUser.email,
                    descriptor: Array.from(descriptor)
                })
            });

            const result = await response.json();
            if (result.success) {
                setStatus('✅ บันทึกสำเร็จ!');
                localStorage.setItem('currentUser', JSON.stringify(result.user));
                stopDetection();
                stopVideo();
                setTimeout(() => router.push('/home'), 1000);
            } else {
                setStatus('❌ บันทึกไม่สำเร็จ: ' + result.message);
                autoSavedRef.current = false;
                setIsSaving(false);
            }
        } catch (err) {
            console.error(err);
            setStatus('❌ เกิดข้อผิดพลาด');
            autoSavedRef.current = false;
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
            <div className="w-full max-w-md bg-black rounded-2xl overflow-hidden relative shadow-2xl border border-slate-700">
                <h1 className="text-center py-4 text-xl font-bold bg-slate-800">ตั้งค่าใบหน้า</h1>

                <div className="relative aspect-[4/3] bg-black">
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
                        <div className={`w-[220px] h-[300px] border-4 rounded-[50%] transition-colors duration-300 shadow-[0_0_100px_rgba(0,0,0,0.5)_inset]
                ${stableCount >= STABLE_FRAMES_REQUIRED ? 'border-green-500' : 'border-blue-500/50'}`}
                        />
                    </div>

                    <div className="absolute bottom-4 left-0 right-0 text-center px-4">
                        <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
                            {status}
                        </span>
                    </div>
                </div>

                <div className="p-6 text-center">
                    <p className="text-gray-400 text-sm mb-4">
                        กรุณามองหน้าตรงและอยู่นิ่งๆ เพื่อให้ระบบจดจำใบหน้าของท่าน
                    </p>
                    <button
                        onClick={() => router.push('/login')}
                        className="text-gray-500 hover:text-white underline text-sm"
                    >
                        ยกเลิก / กลับหน้าล็อกอิน
                    </button>
                </div>
            </div>
        </div>
    );
}
