/**
 * SUSHEE Karaoke - Shareable Score Card Generator (Canvas PNG -> Web Share / Download)
 */
class ScoreCardRenderer {
  static async generateBlob({ title = 'Karaoke Track', artist = 'SUSHEE', score = 0, grade = 'A', pitchScore = 0, timingScore = 0, singerName = '' }) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background dark neon gradient
    const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
    bg.addColorStop(0, '#07080d');
    bg.addColorStop(0.5, '#13162b');
    bg.addColorStop(1, '#1d1035');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1350);

    // Subtle glowing orbs
    const orb1 = ctx.createRadialGradient(220, 260, 20, 220, 260, 420);
    orb1.addColorStop(0, 'rgba(0, 242, 254, 0.28)');
    orb1.addColorStop(1, 'rgba(0, 242, 254, 0)');
    ctx.fillStyle = orb1;
    ctx.fillRect(0, 0, 1080, 1350);

    const orb2 = ctx.createRadialGradient(880, 1040, 20, 880, 1040, 460);
    orb2.addColorStop(0, 'rgba(139, 92, 246, 0.30)');
    orb2.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.fillStyle = orb2;
    ctx.fillRect(0, 0, 1080, 1350);

    // Card frame
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(56, 56, 968, 1238);

    // Brand badge
    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎤 SUSHEE KARAOKE STUDIO', 540, 150);

    if (singerName) {
      ctx.fillStyle = '#ddd6fe';
      ctx.font = '600 32px sans-serif';
      ctx.fillText(`Penyanyi: ${singerName}`, 540, 215);
    }

    // Song title & artist
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px sans-serif';
    const truncTitle = title.length > 28 ? title.slice(0, 27) + '…' : title;
    ctx.fillText(truncTitle, 540, 325);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 34px sans-serif';
    ctx.fillText(artist || 'Karaoke Track', 540, 385);

    // Giant Grade Circle
    ctx.beginPath();
    ctx.arc(540, 650, 195, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 242, 254, 0.10)';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#00f2fe';
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.font = '900 180px sans-serif';
    ctx.fillText(grade || 'A', 540, 700);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText(`SKOR ${score} / 100`, 540, 920);

    // Breakdown bars
    const drawBar = (label, pct, y, color) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 32px sans-serif';
      ctx.fillText(label, 140, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = color;
      ctx.fillText(`${pct}%`, 940, y);

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(140, y + 18, 800, 24);
      ctx.fillStyle = color;
      ctx.fillRect(140, y + 18, Math.round(800 * Math.max(0, Math.min(100, pct)) / 100), 24);
    };

    drawBar('Stabilitas Nada', pitchScore, 1020, '#00f2fe');
    drawBar('Ketepatan Tempo', timingScore, 1130, '#a78bfa');

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '500 26px sans-serif';
    ctx.fillText('Direkam & dinilai secara real-time di SUSHEE Karaoke', 540, 1255);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  static async shareCard(data, showToast = null) {
    const blob = await ScoreCardRenderer.generateBlob(data);
    if (!blob) return false;
    const safeName = ((data.title || 'SUSHEE_Score').replace(/[^a-zA-Z0-9_-]/g, '_')) + '_Score.png';
    const text = `🏆 Skor Karaoke "${data.title}": ${data.score}/100 (Grade ${data.grade}) di SUSHEE Karaoke!`;

    try {
      if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.share) {
        const file = new File([blob], safeName, { type: 'image/png' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'SUSHEE Karaoke Score', text, files: [file] });
          if (showToast) showToast('✅ Kartu skor berhasil dibagikan!', 'success');
          return true;
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
    }

    // Fallback: download PNG
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
    if (showToast) showToast('📸 Kartu skor PNG diunduh — siap dibagikan!', 'success');
    return true;
  }
}

window.ScoreCardRenderer = ScoreCardRenderer;
