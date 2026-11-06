import type { JSX } from "react";
import type { TemperatureSample } from "../types";

interface ThermalEnvelopeChartProps {
  samples: TemperatureSample[];
  tempBandC: [number, number];
}

const WIDTH = 600;
const HEIGHT = 240;
const PAD = 8;

interface Geometry {
  points: string;
  bandYTop: number;
  bandYBottom: number;
  yMin: number;
  yMax: number;
  xMax: number;
}

function computeGeometry(samples: TemperatureSample[], band: [number, number]): Geometry | null {
  if (samples.length < 2) {
    return null;
  }
  const xMax = samples[samples.length - 1]!.timeS;
  if (xMax <= 0) {
    return null;
  }
  const temps = samples.map((sample) => sample.tempC);
  const dataMin = Math.min(...temps);
  const dataMax = Math.max(...temps);
  // Pad the vertical axis a little past both the band and the data.
  const yMin = Math.min(band[0], dataMin) - 5;
  const yMax = Math.max(band[1], dataMax) + 5;
  const scaleX = (timeS: number) => PAD + (timeS / xMax) * (WIDTH - 2 * PAD);
  const scaleY = (tempC: number) =>
    HEIGHT - PAD - ((tempC - yMin) / (yMax - yMin)) * (HEIGHT - 2 * PAD);
  const points = samples
    .map((sample) => `${scaleX(sample.timeS)},${scaleY(sample.tempC)}`)
    .join(" ");
  return {
    points,
    bandYTop: scaleY(band[1]),
    bandYBottom: scaleY(band[0]),
    yMin,
    yMax,
    xMax,
  };
}

/** Safety-envelope chart: SOFC stack temperature against the safe band,
 * drawn as an inline SVG with no chart dependency. */
export function ThermalEnvelopeChart({
  samples,
  tempBandC,
}: ThermalEnvelopeChartProps): JSX.Element {
  const geometry = computeGeometry(samples, tempBandC);
  if (geometry === null) {
    return <p className="tp-chart__empty">Not enough temperature samples to plot the envelope.</p>;
  }
  return (
    <svg
      role="img"
      aria-label="SOFC stack temperature against the safe temperature band"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="tp-chart"
    >
      <rect
        x={PAD}
        y={geometry.bandYTop}
        width={WIDTH - 2 * PAD}
        height={geometry.bandYBottom - geometry.bandYTop}
        fill="var(--tp-color-chart-band)"
        stroke="var(--tp-color-chart-band-edge)"
      />
      <polyline
        points={geometry.points}
        fill="none"
        stroke="var(--tp-color-chart-line)"
        strokeWidth={2}
      />
      <text x={PAD} y={geometry.bandYTop - 2} fontSize={11} fill="var(--tp-color-text-muted)">
        {tempBandC[1]} °C
      </text>
      <text x={PAD} y={geometry.bandYBottom + 12} fontSize={11} fill="var(--tp-color-text-muted)">
        {tempBandC[0]} °C
      </text>
    </svg>
  );
}
