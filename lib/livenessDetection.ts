/**
 * Liveness Detection Utilities
 * ใช้สำหรับตรวจจับว่าผู้ใช้เป็นคนจริง ไม่ใช่รูปภาพหรือวิดีโอ
 */

import * as faceapi from 'face-api.js';

// ===== Types =====
export type Point = { x: number; y: number };
export type ChallengeType = 'blink' | 'turn_left' | 'turn_right' | 'nod';
export type LivenessState = {
    blinkCount: number;
    lastEAR: number;
    eyeClosedFrames: number;
    lastHeadPose: { yaw: number; pitch: number };
    motionScore: number;
    challengeCompleted: boolean;
};

// ===== Constants =====
const EAR_THRESHOLD = 0.21;        // ค่า EAR ที่ถือว่าหลับตา
const EAR_CONSEC_FRAMES = 2;       // จำนวน frame ที่ต้องหลับตาติดต่อกัน
const HEAD_TURN_THRESHOLD = 0.45; // ค่า ratio ที่ถือว่าหันซ้าย/ขวา
const MOTION_THRESHOLD = 5;       // pixel movement ขั้นต่ำ

// ===== Eye Aspect Ratio (EAR) =====
/**
 * คำนวณ Eye Aspect Ratio สำหรับตรวจจับกระพริบตา
 * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 * 
 * Eye landmarks (0-based index in face-api.js):
 *   p1 (0) ------- p4 (3)
 *      p2 (1)   p3 (2)
 *      p6 (5)   p5 (4)
 */
function distance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function calculateEAR(eye: Point[]): number {
    if (eye.length < 6) return 0.3; // default open eye

    const vertical1 = distance(eye[1], eye[5]); // p2-p6
    const vertical2 = distance(eye[2], eye[4]); // p3-p5
    const horizontal = distance(eye[0], eye[3]); // p1-p4

    if (horizontal === 0) return 0.3;

    const ear = (vertical1 + vertical2) / (2.0 * horizontal);
    return ear;
}

/**
 * ตรวจจับว่ากำลังกระพริบตาหรือไม่
 * คืนค่า true ถ้าเพิ่งกระพริบเสร็จ (ตาเปิด→หลับ→เปิด)
 */
export function detectBlink(
    landmarks: faceapi.FaceLandmarks68,
    state: LivenessState
): { isBlink: boolean; currentEAR: number; newState: LivenessState } {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const leftEAR = calculateEAR(leftEye);
    const rightEAR = calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;

    let isBlink = false;
    const newState = { ...state, lastEAR: avgEAR };

    // ตรวจว่าตาหลับ
    if (avgEAR < EAR_THRESHOLD) {
        newState.eyeClosedFrames += 1;
    } else {
        // ถ้าเพิ่งเปิดตาหลังจากหลับไปพอสมควร → นับเป็น 1 blink
        if (state.eyeClosedFrames >= EAR_CONSEC_FRAMES) {
            newState.blinkCount += 1;
            isBlink = true;
        }
        newState.eyeClosedFrames = 0;
    }

    return { isBlink, currentEAR: avgEAR, newState };
}

// ===== Head Pose Detection =====
/**
 * คำนวณมุมหน้า (yaw = หันซ้าย/ขวา, pitch = เงย/ก้ม)
 * ใช้วิธีเปรียบเทียบระยะจมูกถึงตาซ้าย vs ตาขวา
 */
export function calculateHeadPose(landmarks: faceapi.FaceLandmarks68): { yaw: number; pitch: number; ratio: number } {
    const nose = landmarks.getNose()[3]; // จุดกลางจมูก
    const leftEye = landmarks.getLeftEye()[0]; // มุมนอกตาซ้าย
    const rightEye = landmarks.getRightEye()[3]; // มุมนอกตาขวา

    const distToLeftEye = Math.abs(nose.x - leftEye.x);
    const distToRightEye = Math.abs(nose.x - rightEye.x);

    // ratio < 1 = หันขวา (จมูกใกล้ตาซ้าย)
    // ratio > 1 = หันซ้าย (จมูกใกล้ตาขวา)
    const ratio = distToLeftEye / distToRightEye;

    // แปลงเป็นมุมโดยประมาณ (-30 ถึง +30 องศา)
    const yaw = (ratio - 1) * 30;

    // สำหรับ pitch ใช้ตำแหน่ง y ของจมูกเทียบกับตา
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const pitch = (nose.y - eyeCenterY) / 50; // normalize

    return { yaw, pitch, ratio };
}

/**
 * ตรวจว่าผู้ใช้หันไปทางที่กำหนดหรือไม่
 */
export function detectHeadTurn(
    landmarks: faceapi.FaceLandmarks68,
    direction: 'left' | 'right'
): boolean {
    const { ratio } = calculateHeadPose(landmarks);

    if (direction === 'left') {
        return ratio > (1 + HEAD_TURN_THRESHOLD); // หันซ้าย = ratio สูง
    } else {
        return ratio < (1 - HEAD_TURN_THRESHOLD); // หันขวา = ratio ต่ำ
    }
}

/**
 * ตรวจว่าหน้าตรงหรือไม่
 */
export function isFacingStraight(landmarks: faceapi.FaceLandmarks68): boolean {
    const { ratio } = calculateHeadPose(landmarks);
    return ratio > 0.75 && ratio < 1.35;
}

// ===== Motion Detection =====
/**
 * ตรวจจับความเคลื่อนไหวจากตำแหน่ง landmarks
 * เปรียบเทียบกับ frame ก่อนหน้า
 */
export function detectMotion(
    currentLandmarks: faceapi.FaceLandmarks68,
    previousLandmarks: faceapi.FaceLandmarks68 | null
): number {
    if (!previousLandmarks) return 0;

    const currentNose = currentLandmarks.getNose()[3];
    const previousNose = previousLandmarks.getNose()[3];

    const movement = distance(currentNose, previousNose);
    return movement;
}

/**
 * ตรวจว่ามีการเคลื่อนไหวตามธรรมชาติหรือไม่ (Micro-movements)
 * คนจริงจะมีการขยับเล็กน้อยตลอดเวลา
 */
export function hasNaturalMovement(motionHistory: number[]): boolean {
    if (motionHistory.length < 5) return false;

    // คำนวณค่าเฉลี่ยความเคลื่อนไหว
    const avgMotion = motionHistory.reduce((a, b) => a + b, 0) / motionHistory.length;

    // ถ้านิ่งเกินไป (< 0.5 pixel) = น่าสงสัย (อาจเป็นรูป)
    // ถ้าขยับมากเกินไป (> 20 pixel) = น่าสงสัย (อาจเป็นวิดีโอ loop)
    return avgMotion >= 0.5 && avgMotion <= 20;
}

// ===== Challenge Generator =====
const CHALLENGES: ChallengeType[] = ['blink', 'turn_left', 'turn_right'];

/**
 * สุ่มท่าทางที่ต้องให้ผู้ใช้ทำ
 */
export function generateRandomChallenge(): ChallengeType {
    const idx = Math.floor(Math.random() * CHALLENGES.length);
    return CHALLENGES[idx];
}

/**
 * สุ่ม challenge หลายอัน (ไม่ซ้ำกัน)
 */
export function generateChallengeSequence(count: number = 2): ChallengeType[] {
    const shuffled = [...CHALLENGES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// ===== Challenge Instructions =====
export function getChallengeInstruction(challenge: ChallengeType): string {
    switch (challenge) {
        case 'blink':
            return '👁️ กรุณากระพริบตา 2 ครั้ง';
        case 'turn_left':
            return '👈 กรุณาหันหน้าไปทางซ้าย';
        case 'turn_right':
            return '👉 กรุณาหันหน้าไปทางขวา';
        case 'nod':
            return '👇 กรุณาก้มหน้าเล็กน้อย';
        default:
            return '🔵 มองหน้าตรง';
    }
}

// ===== Initial State =====
export function createInitialLivenessState(): LivenessState {
    return {
        blinkCount: 0,
        lastEAR: 0.3,
        eyeClosedFrames: 0,
        lastHeadPose: { yaw: 0, pitch: 0 },
        motionScore: 0,
        challengeCompleted: false,
    };
}
