"use client";
import { forwardRef, useImperativeHandle } from "react";
import { motion, useAnimation } from "motion/react";
import {
  Copy,
  Eye,
  EyeOff,
  LogOut,
  Moon,
  Pencil,
  Share2,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";

// Small, one-shot action feedback, controlled by AnimatedIcon's shared
// pointer/focus and reduced-motion handling. Status icons stay static.
function actionIcon(
  Icon: LucideIcon,
  feedback: "turn" | "lift" | "nudge" = "lift",
) {
  const ActionIcon = forwardRef<
    { startAnimation: () => void; stopAnimation: () => void },
    { size?: number }
  >(({ size = 16 }, ref) => {
    const controls = useAnimation();
    useImperativeHandle(
      ref,
      () => ({
        startAnimation: () => {
          void controls.start(
            feedback === "turn"
              ? { rotate: [0, -15, 0] }
              : feedback === "nudge"
                ? { x: [0, 2, 0] }
                : { y: [0, -2, 0] },
          );
        },
        stopAnimation: () => {
          controls.stop();
          controls.set({ x: 0, y: 0, rotate: 0 });
        },
      }),
      [controls],
    );
    return (
      <motion.span animate={controls} transition={{ duration: 0.28 }}>
        <Icon size={size} />
      </motion.span>
    );
  });
  ActionIcon.displayName = `Action${Icon.displayName || "Icon"}`;
  return ActionIcon;
}
export const actionIcons = {
  copy: actionIcon(Copy),
  share: actionIcon(Share2),
  eye: actionIcon(Eye),
  "eye-off": actionIcon(EyeOff),
  "log-out": actionIcon(LogOut, "nudge"),
  pencil: actionIcon(Pencil, "turn"),
  sun: actionIcon(Sun, "turn"),
  moon: actionIcon(Moon, "turn"),
  x: actionIcon(X, "turn"),
};
