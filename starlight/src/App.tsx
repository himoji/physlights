import React, { useEffect, useState, useRef, useMemo } from "react";

// Define our core interfaces for simulation objects
interface Particle {
  x: number;
  y: number;
  angle: number;
  speed: number;
}

interface ScreenPoint {
  y: number;
  intensity: number;
}

interface SimulationParams {
  slitWidth: number;
  slitDistance: number;
  screenDistance: number;
  wavelength: number;
}

// Constants for simulation dimensions and physics
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 500;
const BARRIER_X = 150;
const SCREEN_MAX_DISTANCE = 2000;

const DoubleSlitSimulation: React.FC = () => {
  // Canvas and animation references
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>();
  const screenPointsRef = useRef<ScreenPoint[]>([]);

  // Simulation control state
  const [wavelength, setWavelength] = useState(550);
  const [slitWidth, setSlitWidth] = useState(2);
  const [slitDistance, setSlitDistance] = useState(20);
  const [screenDistance, setScreenDistance] = useState(500);
  const [particleSpeed, setParticleSpeed] = useState(2);
  const [simulationType, setSimulationType] = useState<"wave" | "particle">(
    "wave"
  );
  const [isRunning, _setIsRunning] = useState(true);
  const [intensityThreshold, setIntensityThreshold] = useState(0.1);

  // Convert wavelength to visible color with intensity
  const wavelengthToColor = useMemo(() => {
    const colorCache = new Map<string, string>();

    return (wavelength: number, intensity = 1): string => {
      const key = `${wavelength}-${intensity}`;
      if (colorCache.has(key)) return colorCache.get(key)!;

      let r = 0,
        g = 0,
        b = 0;
      wavelength = Math.min(Math.max(wavelength, 380), 750);

      if (wavelength < 440) {
        r = -(wavelength - 440) / (440 - 380);
        b = 1;
      } else if (wavelength < 490) {
        g = (wavelength - 440) / (490 - 440);
        b = 1;
      } else if (wavelength < 510) {
        g = 1;
        b = -(wavelength - 510) / (510 - 490);
      } else if (wavelength < 580) {
        g = 1;
        r = (wavelength - 510) / (580 - 510);
      } else if (wavelength < 645) {
        r = 1;
        g = -(wavelength - 645) / (645 - 580);
      } else {
        r = 1;
      }

      const color = `rgba(${Math.round(r * 255)}, ${Math.round(
        g * 255
      )}, ${Math.round(b * 255)}, ${intensity})`;
      colorCache.set(key, color);
      return color;
    };
  }, []);

  // Calculate interference pattern intensity at a point
  const calculateIntensity = useMemo(() => {
    const intensityCache = new Map<string, number>();

    return (params: SimulationParams & { y: number }): number => {
      const key = `${params.y}-${params.wavelength}-${params.slitWidth}-${params.slitDistance}-${params.screenDistance}`;
      if (intensityCache.has(key)) return intensityCache.get(key)!;

      const center = CANVAS_HEIGHT / 2;
      const theta = Math.atan2(
        params.y - center,
        params.screenDistance - BARRIER_X
      );

      // Convert to proper SI units for calculations
      const lambda = params.wavelength * 1e-9; // wavelength in meters
      const a = params.slitWidth * 1e-6; // slit width in meters
      const d = params.slitDistance * 1e-6; // slit separation in meters

      // Single slit diffraction factor
      const alpha = (Math.PI * a * Math.sin(theta)) / lambda;
      const singleSlitIntensity =
        alpha === 0 ? 1 : Math.pow(Math.sin(alpha) / alpha, 2);

      // Double slit interference factor
      const delta = (Math.PI * d * Math.sin(theta)) / lambda;
      const doubleSlitIntensity = Math.pow(Math.cos(delta), 2);

      // Combined intensity
      const intensity = singleSlitIntensity * doubleSlitIntensity;
      intensityCache.set(key, intensity);
      return intensity;
    };
  }, []);

  // Calculate quantum probability-based particle path
  const calculateParticlePath = (
    startY: number,
    params: SimulationParams
  ): { endY: number; shouldShow: boolean } => {
    const possiblePositions: { y: number; probability: number }[] = [];
    const step = 1; // Sample every pixel on screen

    // Calculate probability distribution across screen
    for (let y = 0; y < CANVAS_HEIGHT; y += step) {
      const intensity = calculateIntensity({
        ...params,
        y,
      });
      possiblePositions.push({ y, probability: intensity });
    }

    // Normalize probabilities
    const totalProbability = possiblePositions.reduce(
      (sum, pos) => sum + pos.probability,
      0
    );
    possiblePositions.forEach((pos) => (pos.probability /= totalProbability));

    // Choose end position based on quantum probability
    let random = Math.random();
    let chosenY = startY;

    for (const pos of possiblePositions) {
      random -= pos.probability;
      if (random <= 0) {
        chosenY = pos.y;
        break;
      }
    }

    // Determine if particle should be shown based on interference pattern
    const finalIntensity = calculateIntensity({
      ...params,
      y: chosenY,
    });

    const shouldShow = finalIntensity > intensityThreshold;

    return {
      endY: chosenY,
      shouldShow,
    };
  };

  // Calculate display scale based on screen distance
  const scale = useMemo(
    () => Math.min(1, CANVAS_WIDTH / screenDistance),
    [screenDistance]
  );

  // Main simulation effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize offscreen canvas for double buffering
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement("canvas");
      offscreenCanvasRef.current.width = CANVAS_WIDTH;
      offscreenCanvasRef.current.height = CANVAS_HEIGHT;
    }

    const ctx = canvas.getContext("2d", { alpha: false })!;
    const offscreenCtx = offscreenCanvasRef.current.getContext("2d", {
      alpha: false,
    })!;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    let particles: Particle[] = [];
    let lastTime = 0;

    const drawFrame = (timestamp: number) => {
      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;

      // Clear canvas
      offscreenCtx.fillStyle = "#1a1a1a";
      offscreenCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Apply scale transformation
      offscreenCtx.save();
      offscreenCtx.scale(scale, 1);

      // Draw light source
      offscreenCtx.fillStyle = "#ffff00";
      offscreenCtx.beginPath();
      offscreenCtx.arc(50, CANVAS_HEIGHT / 2, 8, 0, 2 * Math.PI);
      offscreenCtx.fill();

      // Draw barrier with slits
      const slitY1 = CANVAS_HEIGHT / 2 - slitDistance / 2;
      const slitY2 = CANVAS_HEIGHT / 2 + slitDistance / 2;
      offscreenCtx.fillStyle = "#666666";
      offscreenCtx.fillRect(BARRIER_X, 0, 5, CANVAS_HEIGHT);
      offscreenCtx.clearRect(BARRIER_X, slitY1 - slitWidth / 2, 5, slitWidth);
      offscreenCtx.clearRect(BARRIER_X, slitY2 - slitWidth / 2, 5, slitWidth);

      // Draw screen
      const adjustedScreenX = screenDistance / scale;
      offscreenCtx.fillStyle = "#ffffff";
      offscreenCtx.fillRect(adjustedScreenX, 0, 5, CANVAS_HEIGHT);

      if (simulationType === "wave") {
        // Wave visualization
        const lambda = wavelength / 100;
        const step = Math.max(lambda, lambda * (screenDistance / 500));

        // Draw expanding wavefronts
        for (let r = 0; r < screenDistance - BARRIER_X; r += step) {
          const opacity = Math.max(0.1, 1 - r / (screenDistance - BARRIER_X));
          [slitY1, slitY2].forEach((slitY) => {
            offscreenCtx.beginPath();
            offscreenCtx.arc(BARRIER_X, slitY, r, -Math.PI / 2, Math.PI / 2);
            offscreenCtx.strokeStyle = wavelengthToColor(
              wavelength,
              opacity * 0.2
            );
            offscreenCtx.stroke();
          });
        }

        // Draw interference pattern
        const yStep = Math.max(1, Math.floor(CANVAS_HEIGHT / 200));
        for (let y = 0; y < CANVAS_HEIGHT; y += yStep) {
          const intensity = calculateIntensity({
            wavelength,
            slitWidth,
            slitDistance,
            screenDistance,
            y,
          });
          offscreenCtx.fillStyle = wavelengthToColor(
            wavelength,
            intensity * 0.8
          );
          offscreenCtx.fillRect(adjustedScreenX + 10, y, 80, yStep);
        }
      } else if (isRunning) {
        // Particle simulation
        if (deltaTime > 0 && Math.random() < 0.5) {
          const slit = Math.random() < 0.5 ? slitY1 : slitY2;

          // Calculate quantum path
          const particlePath = calculateParticlePath(slit, {
            wavelength,
            slitWidth,
            slitDistance,
            screenDistance,
          });

          // Only create particle if it follows allowed quantum path
          if (particlePath.shouldShow) {
            const angle = Math.atan2(
              particlePath.endY - slit,
              screenDistance - BARRIER_X
            );
            particles.push({
              x: BARRIER_X,
              y: slit,
              angle,
              speed: particleSpeed,
            });
          }
        }

        // Update and draw particles
        particles = particles.filter((particle) => {
          const scaledX = particle.x / scale;
          const nextX = particle.x + particle.speed;
          const nextY = particle.y + particle.speed * Math.tan(particle.angle);

          if (nextX / scale >= adjustedScreenX) {
            if (nextY >= 0 && nextY <= CANVAS_HEIGHT) {
              screenPointsRef.current.push({ y: nextY, intensity: 1 });
            }
            return false;
          }

          particle.x = nextX;
          particle.y = nextY;

          if (particle.y >= 0 && particle.y <= CANVAS_HEIGHT) {
            offscreenCtx.beginPath();
            offscreenCtx.arc(scaledX, particle.y, 2, 0, 2 * Math.PI);
            offscreenCtx.fillStyle = wavelengthToColor(wavelength, 0.8);
            offscreenCtx.fill();
          }

          return particle.y >= 0 && particle.y <= CANVAS_HEIGHT;
        });

        // Draw accumulated screen points with intensity filtering
        screenPointsRef.current = screenPointsRef.current.filter((point) => {
          const intensity = calculateIntensity({
            wavelength,
            slitWidth,
            slitDistance,
            screenDistance,
            y: point.y,
          });

          const shouldShow = intensity > 0.1;
          if (shouldShow) {
            offscreenCtx.fillStyle = wavelengthToColor(
              wavelength,
              intensity * 0.5
            );
            offscreenCtx.fillRect(adjustedScreenX + 10, point.y, 80, 1);
          }
          return shouldShow;
        });
      }

      offscreenCtx.restore();

      // Copy from offscreen canvas to main canvas
      ctx.drawImage(offscreenCanvasRef.current!, 0, 0);

      animationRef.current = requestAnimationFrame(drawFrame);
    };

    animationRef.current = requestAnimationFrame(drawFrame);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    wavelength,
    slitWidth,
    slitDistance,
    screenDistance,
    simulationType,
    isRunning,
    scale,
    wavelengthToColor,
    calculateIntensity,
    particleSpeed,
  ]);

  // Render UI controls and canvas
  return (
    <div className="p-6 w-full mx-auto bg-gray-900">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-white">Type:</label>
            <select
              value={simulationType}
              onChange={(e) => {
                setSimulationType(e.target.value as "wave" | "particle");
                screenPointsRef.current = [];
              }}
              className="w-full p-2 rounded bg-gray-800 text-white"
            >
              <option value="wave">Wave</option>
              <option value="particle">Particle</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-white">Wavelength: {wavelength} nm</label>
            <input
              type="range"
              min="380"
              max="750"
              value={wavelength}
              onChange={(e) => setWavelength(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-white">Slit Width: {slitWidth} µm</label>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={slitWidth}
            onChange={(e) => setSlitWidth(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <label className="text-white">Slit Distance: {slitDistance} µm</label>
          <input
            type="range"
            min="5"
            max="50"
            value={slitDistance}
            onChange={(e) => setSlitDistance(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <label className="text-white">
            Screen Distance: {(screenDistance / 10).toFixed(1)} cm
          </label>
          <input
            type="range"
            min="400"
            max={SCREEN_MAX_DISTANCE}
            step="10"
            value={screenDistance}
            onChange={(e) => setScreenDistance(Number(e.target.value))}
            className="w-full"
          />
        </div>
        {simulationType !== "particle" ? (
          <></>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-white">
                Particle speed: {particleSpeed}
              </label>
              <input
                type="range"
                min="1"
                max={10}
                step="1"
                value={particleSpeed}
                onChange={(e) => setParticleSpeed(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </>
        )}
        {simulationType !== "particle" ? (
          <></>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-white">
                Particle threshold: {intensityThreshold}
              </label>
              <input
                type="range"
                min="1"
                max={10}
                step="1"
                value={intensityThreshold}
                onChange={(e) => setIntensityThreshold(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="w-full border border-gray-600 rounded bg-gray-900 mt-4"
      />
    </div>
  );
};

export default DoubleSlitSimulation;
