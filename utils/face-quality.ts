import type { FaceBounds, LightingQuality, AlignmentStatus, ScanAngle } from "@/types/schema";
import { Dimensions } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const ANGLE_YAW_TARGET: Record<ScanAngle, number> = {
  front: 0,
  left: 30,
  right: -30,
};

const ANGLE_YAW_TOLERANCE = 18;

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
    score -= Math.min(40, yawDiff * 2.0);
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
    tips.push("Move right");
  } else if (faceCenterX > 0.65) {
    tips.push("Move left");
  }

  if (faceCenterY < 0.3) {
    tips.push("Move down");
  } else if (faceCenterY > 0.6) {
    tips.push("Move up");
  }

  if (targetAngle) {
    const targetYaw = ANGLE_YAW_TARGET[targetAngle];
    const yawDiff = yawAngle - targetYaw;
    if (targetAngle === "left" && yawDiff < -10) {
      tips.push("Turn head more to your right");
    } else if (targetAngle === "left" && yawDiff > 10) {
      tips.push("Turn head less to your right");
    } else if (targetAngle === "right" && yawDiff > 10) {
      tips.push("Turn head more to your left");
    } else if (targetAngle === "right" && yawDiff < -10) {
      tips.push("Turn head less to your left");
    } else if (targetAngle === "front" && Math.abs(yawAngle) > 10) {
      tips.push(yawAngle > 0 ? "Turn head slightly left" : "Turn head slightly right");
    }
  } else {
    if (yawAngle < -25) {
      tips.push("Turn slightly right");
    } else if (yawAngle > 25) {
      tips.push("Turn slightly left");
    }
  }

  if (rollAngle < -15) {
    tips.push("Tilt head right");
  } else if (rollAngle > 15) {
    tips.push("Tilt head left");
  }

  if (tips.length === 0) {
    return "Adjust position slightly";
  }
  return tips.slice(0, 2).join(", ");
}
