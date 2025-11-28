// Confetti utility function
export const triggerConfetti = () => {
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Simple confetti effect using canvas
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
  }> = [];

  const colors = ['#BE123C', '#06B6D4', '#F59E0B', '#10B981', '#FCD34D'];

  // Create particles
  for (let i = 0; i < 50; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10 - 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 5 + 3,
    });
  }

  let animationFrame: number;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((particle, index) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.3; // Gravity

      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();

      // Remove particles that are off screen
      if (particle.y > canvas.height || particle.x < 0 || particle.x > canvas.width) {
        particles.splice(index, 1);
      }
    });

    if (particles.length > 0) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animationFrame);
      document.body.removeChild(canvas);
    }
  };

  animate();

  // Auto-remove after 1 second
  setTimeout(() => {
    if (document.body.contains(canvas)) {
      document.body.removeChild(canvas);
    }
  }, 1000);
};


