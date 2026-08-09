const GRADIENTS = {
  green: ["#3E8F5C", "#4FAF74"],
  yellow: ["#C6862A", "#DDA24C"],
  orange: ["#C6862A", "#DDA24C"],
  blue: ["#2B4CFF", "#4A63FF"],
  purple: ["#7B5FD1", "#9B7FE8"],
  gray: ["#6C7078", "#8B8F97"],
};

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let lines = [];
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word + " ";
    } else {
      line = test;
    }
  }
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l.trim(), x, y + i * lineHeight));
  return lines.length;
}

export async function generateReviewImageBlob(review, stateLabel) {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const [c1, c2] = GRADIENTS[review.decision_state] ?? GRADIENTS.gray;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "500 32px sans-serif";
  ctx.fillText(`WEEK OF ${review.week_start}`, 80, 130);

  ctx.fillStyle = "#fff";
  ctx.font = "700 76px sans-serif";
  ctx.fillText(stateLabel.toUpperCase(), 80, 250);

  ctx.font = "400 40px sans-serif";
  wrapText(ctx, review.recommendation_text || "", 80, 340, size - 160, 52);

  if (review.progressive_overload_lb > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.roundRect(80, 560, size - 160, 140, 20);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 56px sans-serif";
    ctx.fillText(`+${review.progressive_overload_lb} lb overloaded`, 110, 640);
  }

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 34px sans-serif";
  ctx.fillText("EZfit Coach", 80, size - 70);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function shareOrDownloadReviewImage(review, stateLabel) {
  const blob = await generateReviewImageBlob(review, stateLabel);
  const file = new File([blob], `ezfit-week-${review.week_start}.png`, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "My EZfit weekly review" });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
