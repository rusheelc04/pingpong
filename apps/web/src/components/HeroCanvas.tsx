// The landing-page canvas is decorative only, so it stays lightweight and loops on a tiny fake rally.
import { useEffect, useRef } from "react";

export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = rect?.width ?? 560;
      canvas.height = rect?.height ?? 320;
    };

    resize();
    window.addEventListener("resize", resize);

    let leftY = 120;
    let rightY = 120;
    let ballX = 180;
    let ballY = 80;
    let dx = 4;
    let dy = 2.6;
    let frameId = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgba(2, 10, 28, 0.94)";
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(83, 208, 255, 0.18)";
      context.setLineDash([12, 12]);
      context.beginPath();
      context.moveTo(width / 2, 0);
      context.lineTo(width / 2, height);
      context.stroke();
      context.setLineDash([]);

      leftY += (ballY - 40 - leftY) * 0.07;
      rightY += (ballY - 40 - rightY) * 0.05;
      ballX += dx;
      ballY += dy;

      if (ballY < 16 || ballY > height - 16) {
        dy *= -1;
      }
      if (ballX < 26 || ballX > width - 26) {
        dx *= -1;
      }

      context.shadowBlur = 18;
      context.fillStyle = "#53d0ff";
      context.shadowColor = "#53d0ff";
      context.fillRect(16, leftY, 12, 84);

      context.fillStyle = "#ff5fc4";
      context.shadowColor = "#ff5fc4";
      context.fillRect(width - 28, rightY, 12, 84);

      context.beginPath();
      context.fillStyle = "#d5ff5f";
      context.shadowColor = "#d5ff5f";
      context.arc(ballX, ballY, 10, 0, Math.PI * 2);
      context.fill();

      context.shadowBlur = 0;
      context.fillStyle = "rgba(255,255,255,0.7)";
      context.font = "32px 'Chakra Petch', sans-serif";
      context.fillText("2", width * 0.25, 42);
      context.fillText("3", width * 0.75, 42);

      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="hero-canvas" ref={canvasRef} />;
}
