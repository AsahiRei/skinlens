import type { FaceBounds, LightingQuality, AlignmentStatus, ScanAngle } from "@/types/schema";
import { Dimensions } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const ANGLE_YAW_TARGET: Record<ScanAngle, number> = {
  front: 0,
  // Yaw here is screen/mirror-corrected (callers negate ML Kit's raw yaw
  // for the front camera): positive = face turned toward the right side of
  // the on-screen preview.
  // - showing your LEFT cheek = nose points to screen-left = negative yaw
  // - showing your RIGHT cheek = nose points to screen-right = positive yaw
  // Targets are pushed to ±35 so the accept ranges don't overlap the
  // front range (|yaw| < 15). Otherwise a straight-on face scores ~60 and
  // passes the side-angle gate (the reported bug).
  left: -35,
  right: 35,
};

const ANGLE_YAW_TOLERANCE = 15;

export function evaluateLighting(
  brightness: number,
  contrast: number,
): { quality: LightingQuality; message: string; icon: "sun" | "moon" | "contrast" } {
  if (brightness < 30) {
    return { quality: "dark", message: "Too dark — move to a brighter area", icon: "moon" };
  }
  if (brightness < 60) {
    return { quality: "dim", message: "Dim lighting — find more light", icon: "moon" };
  }
  if (brightness > 220) {
    return { quality: "glare", message: "Too bright — reduce overhead light", icon: "sun" };
  }
  if (brightness > 180) {
    return { quality: "bright", message: "Slightly bright — tilt away from light", icon: "sun" };
  }
  if (contrast < 20) {
    return { quality: "dim", message: "Low contrast — face the light source", icon: "contrast" };
  }
  return { quality: "good", message: "Good lighting", icon: "sun" };
}

export function evaluateAlignment(
  face: FaceBounds,
  targetAngle?: ScanAngle,
): AlignmentStatus {
  const faceCenterX = (face.x + face.width / 2) / SCREEN_W;
  const faceCenterY = (face.y + face.height / 2) / SCREEN_H;

  const xDeviation = Math.abs(faceCenterX - 0.5);
  const yDeviation = Math.abs(faceCenterY - 0.45);

  const isCentered = xDeviation < 0.15 && yDeviation < 0.15;

  const rollAngle = face.rollAngle ?? 0;
  const isLevel = Math.abs(rollAngle) < 15;

  const yawAngle = face.yawAngle ?? 0;

  let score = 100;

  score -= Math.min(30, xDeviation * 120);
  score -= Math.min(25, yDeviation * 100);
  score -= Math.min(15, Math.abs(rollAngle) * 1.0);

  if (targetAngle) {
    const targetYaw = ANGLE_YAW_TARGET[targetAngle];
    const yawDiff = Math.abs(yawAngle - targetYaw);
    const isFacingCorrect = yawDiff < ANGLE_YAW_TOLERANCE;
    score -= Math.min(60, yawDiff * 2.5);
    // Hard gate: outside the yaw window the pose must NOT be capturable,
    // no matter how well centered/level the face is. Without this, a
    // front face (yaw ~0, diff ~35) only loses ~40pts -> score ~60 and
    // wrongly passes the `score >= 50` capture check.
    if (!isFacingCorrect) {
      score = Math.min(score, 45);
    }
    return {
      isCentered,
      isLevel,
      isFacingFront: isFacingCorrect,
      score: Math.max(0, Math.min(100, score)),
    };
  }

  const isFacingFront = Math.abs(yawAngle) < 25;
  score -= Math.min(15, Math.abs(yawAngle) * 0.8);

  return { isCentered, isLevel, isFacingFront, score: Math.max(0, Math.min(100, score)) };
}

export function getAlignmentGuidance(
  alignment: AlignmentStatus,
  face: FaceBounds,
  targetAngle?: ScanAngle,
): string {
  if (alignment.score > 85) return "Perfect — hold still!";

  const faceCenterX = (face.x + face.width / 2) / SCREEN_W;
  const faceCenterY = (face.y + face.height / 2) / SCREEN_H;
  const yawAngle = face.yawAngle ?? 0;
  const rollAngle = face.rollAngle ?? 0;

  const tips: string[] = [];

  if (faceCenterX < 0.35) {
    tips.push("Move your face right to center it");
  } else if (faceCenterX > 0.65) {
    tips.push("Move your face left to center it");
  }

  if (faceCenterY < 0.3) {
    tips.push("Lower your face to center it");
  } else if (faceCenterY > 0.6) {
    tips.push("Raise your face to center it");
  }

  if (targetAngle) {
    const targetYaw = ANGLE_YAW_TARGET[targetAngle];
    const yawDiff = yawAngle - targetYaw;
    if (targetAngle === "left") {
      if (yawAngle > 10) {
        // Turned the wrong way (toward the right cheek side).
        tips.push("Wrong way — turn your head the other way to show your left cheek");
      } else if (yawDiff > 10) {
        tips.push("Turn more to show your left cheek");
      } else if (yawDiff < -10) {
        tips.push("Turn back toward the front");
      }
    } else if (targetAngle === "right") {
      if (yawAngle < -10) {
        // Turned the wrong way (toward the left cheek side).
        tips.push("Wrong way — turn your head the other way to show your right cheek");
      } else if (yawDiff < -10) {
        tips.push("Turn more to show your right cheek");
      } else if (yawDiff > 10) {
        tips.push("Turn back toward the front");
      }
    } else if (targetAngle === "front" && Math.abs(yawAngle) > 10) {
      tips.push("Turn to face the camera");
    }
  } else {
    if (Math.abs(yawAngle) > 25) {
      tips.push("Face the camera straight on");
    }
  }

  if (Math.abs(rollAngle) > 15) {
    tips.push("Straighten your head");
  }

  if (tips.length === 0) {
    return "Center your face and hold still";
  }
  return tips.slice(0, 2).join(", ");
}
