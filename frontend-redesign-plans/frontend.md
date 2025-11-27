import React, { useState, useEffect, useRef, memo } from 'react';
import { 
  motion, 
  AnimatePresence, 
  useMotionValue, 
  useSpring, 
  useTransform, 
  useScroll,
  useMotionTemplate
} from 'framer-motion';
import { 
  Gift, 
  Mail, 
  ArrowRight, 
  CheckCircle2, 
  X, 
  TrendingUp, 
  ShieldCheck, 
  Clock,
  CreditCard,
  Globe,
  Sparkles
} from 'lucide-react';

// --- OPTIMIZED UI COMPONENTS ---

// 1. Particle Background (Canvas) - Memoized to prevent re-renders
const ParticleBackground = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true }); // Optimize context
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Float32Array; // Use typed arrays for performance
    let speeds: Float32Array;
    let opacities: Float32Array;
    let sizes: Float32Array;
    let particleCount = 0;
    
    const init = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);

      // Limit particle count for performance
      particleCount = Math.min(window.innerWidth / 15, 50); 
      
      particles = new Float32Array(particleCount * 2); // x, y
      speeds = new Float32Array(particleCount * 2); // vx, vy
      opacities = new Float32Array(particleCount);
      sizes = new Float32Array(particleCount);

      for (let i = 0; i < particleCount; i++) {
        particles[i * 2] = Math.random() * window.innerWidth;
        particles[i * 2 + 1] = Math.random() * window.innerHeight;
        speeds[i * 2] = (Math.random() - 0.5) * 0.2;
        speeds[i * 2 + 1] = (Math.random() - 0.5) * 0.2;
        opacities[i] = Math.random() * 0.4 + 0.1;
        sizes[i] = Math.random() * 1.5 + 0.2;
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      
      for (let i = 0; i < particleCount; i++) {
        // Update position
        particles[i * 2] += speeds[i * 2];
        particles[i * 2 + 1] += speeds[i * 2 + 1];

        // Wrap
        if (particles[i * 2] < 0) particles[i * 2] = window.innerWidth;
        if (particles[i * 2] > window.innerWidth) particles[i * 2] = 0;
        if (particles[i * 2 + 1] < 0) particles[i * 2 + 1] = window.innerHeight;
        if (particles[i * 2 + 1] > window.innerHeight) particles[i * 2 + 1] = 0;

        // Draw
        ctx.fillStyle = `rgba(255, 255, 255, ${opacities[i]})`;
        ctx.beginPath();
        ctx.arc(particles[i * 2], particles[i * 2 + 1], sizes[i], 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    init();
    animate();

    // Debounce resize
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(init, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0 opacity-40 mix-blend-screen will-change-transform" />;
});

// 2. Magnetic Button - Optimized with transforms
const MagneticButton = ({ children, className, onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { stiffness: 150, damping: 15, mass: 0.1 };
  const mouseX = useSpring(x, springConfig);
  const mouseY = useSpring(y, springConfig);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const { left, top, width, height } = ref.current.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    x.set((e.clientX - centerX) / 3); 
    y.set((e.clientY - centerY) / 3);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: mouseX, y: mouseY }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`will-change-transform ${className}`}
    >
      {children}
    </motion.button>
  );
};

// 3. 3D Tilt Card - Optimized
const TiltCard = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseX = useSpring(x, { stiffness: 400, damping: 90 });
  const mouseY = useSpring(y, { stiffness: 400, damping: 90 });

  const rotateX = useTransform(mouseY, [-0.5, 0.5], ["7.5deg", "-7.5deg"]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-7.5deg", "7.5deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseXFromCenter = e.clientX - rect.left - width / 2;
    const mouseYFromCenter = e.clientY - rect.top - height / 2;
    x.set(mouseXFromCenter / width);
    y.set(mouseYFromCenter / height);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative transition-all duration-200 ease-linear will-change-transform ${className}`}
    >
      <div style={{ transform: "translateZ(50px)" }} className="h-full">
        {children}
      </div>
    </motion.div>
  );
};

const LandingPage = () => {
  const [activeComparison, setActiveComparison] = useState('giftcards');
  const { scrollY } = useScroll();
  
  // Performance Optimization: Use MotionValues for background parallax instead of React state
  const heroParallax = useTransform(scrollY, [0, 500], [0, 100]); // Reduced distance
  const bgParallax = useTransform(scrollY, [0, 1000], [0, -50]); // Reduced distance
  
  // Global Spotlight Optimization
  // We do NOT use useState here to avoid re-rendering the component tree on every mousemove.
  // Instead, we use MotionValues to update the DOM directly.
  const mouseX = useMotionValue(-500); // Start offscreen
  const mouseY = useMotionValue(-500);

  useEffect(() => {
    const updateMousePosition = (e: MouseEvent) => {
      // Direct update to motion value, bypasses React render cycle
      mouseX.set(e.clientX - 250); // Center offset
      mouseY.set(e.clientY - 250);
    };
    window.addEventListener('mousemove', updateMousePosition, { passive: true });
    return () => window.removeEventListener('mousemove', updateMousePosition);
  }, [mouseX, mouseY]);

  const spotlightTransform = useMotionTemplate`translate(${mouseX}px, ${mouseY}px)`;

  // Animation Variants - pre-defined to avoid recreation
  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      
      {/* --- GOD TIER FX LAYERS (GPU ACCELERATED) --- */}
      <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
        {/* Noise Texture - Isolated Layer */}
        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" 
             style={{ 
               backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
               transform: 'translate3d(0,0,0)', // Force hardware acceleration
               willChange: 'transform' 
             }} 
        />
        
        {/* Global Mouse Spotlight - MotionValue Driven (Zero Lag) */}
        <motion.div 
          className="absolute bg-blue-500/10 blur-[120px] rounded-full mix-blend-screen"
          style={{ 
            width: 500, 
            height: 500, 
            transform: spotlightTransform,
            willChange: 'transform'
          }}
        />
      </div>

      {/* Particle Field - Canvas Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none">
         <ParticleBackground />
      </div>

      {/* --- TOP BAR --- */}
      <nav className="fixed top-0 w-full z-50 bg-[#050505]/70 backdrop-blur-md border-b border-white/5 supports-[backdrop-filter]:bg-[#050505]/60 transition-all duration-300">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white group-hover:rotate-12 transition-transform duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              <Gift className="w-4 h-4" />
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 group-hover:to-white transition-all">Crypto Gifting App</span>
          </div>
          
          <MagneticButton className="hidden md:flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-full font-bold shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-white/20 transition-shadow">
            Send a Gift Now
          </MagneticButton>
        </div>
      </nav>

      {/* --- Hero Section --- */}
      <header className="pt-32 pb-20 px-6 relative overflow-hidden contain-paint">
        {/* Animated Beam Background - Parallax Controlled */}
        <motion.div 
          style={{ y: bgParallax }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none opacity-30" 
        />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            style={{ y: heroParallax }}
            className="space-y-8"
          >
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-blue-400 font-medium backdrop-blur-md hover:bg-white/10 transition-colors cursor-default">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              The #1 Way to Gift Crypto
            </motion.div>

            <motion.h1 variants={fadeIn} className="text-6xl md:text-8xl font-bold leading-[1.05] tracking-tight">
              Stop Giving Gift Cards. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 animate-gradient-x bg-[length:200%_auto] inline-block will-change-transform">
                Start Gifting Crypto.
              </span>
            </motion.h1>

            <motion.p variants={fadeIn} className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Send Crypto to anyone in the world using <strong>only their email address.</strong> No apps to install. No accounts to set up.
            </motion.p>

            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              <MagneticButton className="group relative w-full sm:w-auto px-8 py-4 bg-white text-black font-bold text-lg rounded-full shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(120,119,198,0.6)] overflow-hidden transition-all duration-300 transform-gpu">
                 <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out will-change-transform" />
                 <span className="relative z-10 flex items-center justify-center gap-2 group-hover:text-white transition-colors duration-300">
                    Send Your First Gift <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                 </span>
              </MagneticButton>
              
              <div className="flex items-center gap-2 px-6 py-4 rounded-full border border-white/5 bg-white/5 backdrop-blur-sm text-gray-400 text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                No wallet required to receive
              </div>
            </motion.div>
          </motion.div>
        </div>
      </header>

      {/* --- SOCIAL PROOF STRIP (Infinite Scroll) --- */}
      <div className="border-y border-white/5 bg-white/[0.02] overflow-hidden relative z-20 contain-content">
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#050505] to-transparent z-10" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#050505] to-transparent z-10" />
        
        <div className="flex gap-16 py-8 opacity-60 hover:opacity-100 transition-all duration-500 animate-scroll-slow whitespace-nowrap will-change-transform">
           {[1,2,3,4,5,6,7,8].map((i) => (
             <React.Fragment key={i}>
               <div className="text-lg font-bold flex items-center gap-2"><Globe className="w-5 h-5 text-blue-500" /> Global Reach</div>
               <div className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-purple-500" /> Bank-Grade Security</div>
               <div className="text-lg font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-500" /> Instant Settlement</div>
             </React.Fragment>
           ))}
        </div>
      </div>

      {/* --- THE PROBLEM (Glassmorphism + Parallax) --- */}
      <section className="py-32 px-6 bg-[#050505] relative z-10 contain-layout">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="space-y-8 relative z-10"
            >
              <h2 className="text-5xl font-bold text-white leading-tight">The "Old Way" <br/> is <span className="text-red-500">Broken.</span></h2>
              <p className="text-gray-400 text-lg leading-relaxed">
                You spend $50 on an Amazon gift card. They lose it in a drawer. Or you send cash via Venmo, and it gets eaten by inflation. It's boring, forgettable, and shrinking in value.
              </p>
              
              <div className="space-y-4">
                <div className="group flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-300">
                  <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center text-red-500 shrink-0 border border-white/10 group-hover:border-red-500/50 transition-colors">
                    <X className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white group-hover:text-red-200 transition-colors">The "Lost Card" Problem</h4>
                    <p className="text-sm text-gray-500">30% of gift cards are never redeemed.</p>
                  </div>
                </div>
                
                <div className="group flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-300">
                  <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center text-red-500 shrink-0 border border-white/10 group-hover:border-red-500/50 transition-colors">
                    <X className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white group-hover:text-red-200 transition-colors">The "Setup" Headache</h4>
                    <p className="text-sm text-gray-500">"Download this app, scan this code..."</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Visual Metaphor with Depth */}
            <div className="relative h-[500px] w-full perspective-1000">
               <div className="absolute inset-0 bg-gradient-to-tr from-red-900/10 to-transparent rounded-full blur-[80px] will-change-transform" />
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 whileInView={{ opacity: 1, scale: 1 }}
                 viewport={{ once: true }}
                 animate={{ y: [0, -10, 0], rotate: [0, 1, 0] }}
                 transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                 className="relative h-full bg-[#0a0a0a] rounded-3xl border border-white/10 p-8 flex flex-col items-center justify-center text-center shadow-2xl will-change-transform"
               >
                  {/* Floating Garbage Parallax */}
                  <motion.div 
                    animate={{ y: [0, 10, 0], rotate: [-2, -5, -2] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-20 left-10 p-4 bg-[#151515] border border-white/5 rounded-xl opacity-50 will-change-transform"
                  >
                    <div className="w-20 h-2 bg-gray-700 rounded mb-2"/>
                    <div className="w-10 h-2 bg-gray-800 rounded"/>
                  </motion.div>
                  
                  <motion.div 
                    animate={{ y: [0, -15, 0], rotate: [2, 5, 2] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-20 right-10 p-4 bg-[#151515] border border-white/5 rounded-xl opacity-50 will-change-transform"
                  >
                    <div className="w-16 h-2 bg-gray-700 rounded mb-2"/>
                    <div className="w-8 h-2 bg-gray-800 rounded"/>
                  </motion.div>

                  <div className="z-20 relative space-y-2">
                     <div className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-gray-500 to-gray-800 relative">
                       $50.00
                       <div className="absolute inset-0 flex items-center justify-center">
                         <div className="w-full h-2 bg-red-500 rotate-[-12deg] opacity-80" />
                       </div>
                     </div>
                     <p className="text-gray-500 font-mono text-sm uppercase tracking-widest pt-4">Value: Expired</p>
                  </div>
               </motion.div>
            </div>

          </div>
        </div>
      </section>

      {/* --- THE SOLUTION (3D TILT CARDS) --- */}
      <section className="py-32 px-6 relative z-10 contain-layout">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-bold mb-6">Send Wealth Like An Email</h2>
            <p className="text-xl text-gray-400">No tech skills required. If you can send a Gmail, you can send an asset.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 perspective-1000">
            {/* Card 1 */}
            <TiltCard className="h-full">
              <div className="h-full bg-[#0A0A0A] p-10 rounded-[2rem] border border-white/10 hover:border-blue-500/50 transition-colors group relative overflow-hidden transform-gpu">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-8 group-hover:scale-110 transition-transform duration-500 relative z-10 border border-blue-500/20">
                  <Mail className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-4 relative z-10">1. Enter Email</h3>
                <p className="text-gray-400 relative z-10 leading-relaxed">
                  Type their email address and choose an amount. $100 in Bitcoin, USDC, or Gold.
                </p>
              </div>
            </TiltCard>

            {/* Card 2 */}
            <TiltCard className="h-full">
              <div className="h-full bg-[#0A0A0A] p-10 rounded-[2rem] border border-white/10 hover:border-purple-500/50 transition-colors group relative overflow-hidden transform-gpu">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 mb-8 group-hover:scale-110 transition-transform duration-500 relative z-10 border border-purple-500/20">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-4 relative z-10">2. We Magic Link It</h3>
                <p className="text-gray-400 relative z-10 leading-relaxed">
                  They receive a premium email with a secure "Magic Link." No app download required.
                </p>
              </div>
            </TiltCard>

            {/* Card 3 */}
            <TiltCard className="h-full">
              <div className="h-full bg-[#0A0A0A] p-10 rounded-[2rem] border border-white/10 hover:border-green-500/50 transition-colors group relative overflow-hidden transform-gpu">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500 mb-8 group-hover:scale-110 transition-transform duration-500 relative z-10 border border-green-500/20">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-4 relative z-10">3. They Own It</h3>
                <p className="text-gray-400 relative z-10 leading-relaxed">
                  One click and the assets are theirs. They can hold for growth, save, or cash out instantly.
                </p>
              </div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* --- COMPARISON (THE "STACK") --- */}
      <section className="py-32 px-6 bg-[#080808] relative z-10">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Why Smart People Gift Assets</h2>
          </div>

          <div className="grid md:grid-cols-12 gap-8">
            {/* Navigation */}
            <div className="md:col-span-4 space-y-3">
              {[
                { id: 'giftcards', label: 'Vs. Gift Cards', sub: 'The restrictive option', icon: CreditCard },
                { id: 'cash', label: 'Vs. Cash / Venmo', sub: 'The boring option', icon: TrendingUp },
                { id: 'stocks', label: 'Vs. Stocks', sub: 'The complicated option', icon: Globe },
              ].map((item) => (
                <button 
                  key={item.id}
                  onClick={() => setActiveComparison(item.id)}
                  className={`w-full text-left p-6 rounded-2xl border transition-all duration-200 group ${activeComparison === item.id ? 'bg-white text-black border-white shadow-[0_0_30px_-10px_rgba(255,255,255,0.3)] scale-[1.02]' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg mb-1">{item.label}</h3>
                      <p className={`text-sm transition-colors ${activeComparison === item.id ? 'text-gray-600' : 'text-gray-500'}`}>{item.sub}</p>
                    </div>
                    {activeComparison === item.id && <ArrowRight className="w-5 h-5" />}
                  </div>
                </button>
              ))}
            </div>

            {/* Dynamic Display */}
            <div className="md:col-span-8 bg-[#0F0F0F] rounded-[2.5rem] border border-white/10 p-10 md:p-14 flex flex-col justify-center relative overflow-hidden min-h-[400px]">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none will-change-transform" />
              
              <AnimatePresence mode='wait'>
                <motion.div
                  key={activeComparison}
                  initial={{ opacity: 0, x: 10, filter: 'blur(5px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: -10, filter: 'blur(5px)' }}
                  transition={{ duration: 0.3, ease: "circOut" }}
                >
                  {activeComparison === 'giftcards' && (
                    <div className="space-y-8">
                      <div className="flex items-center gap-6 mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-red-500/20 to-transparent border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500 shadow-[0_0_30px_-10px_rgba(239,68,68,0.3)]">
                          <CreditCard size={32} />
                        </div>
                        <h3 className="text-4xl font-bold">The Gift Card Trap</h3>
                      </div>
                      <ul className="space-y-5">
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> Locked to one specific store</li>
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> Expires or gets lost in a drawer</li>
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> Zero potential for growth</li>
                      </ul>
                      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8" />
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-500"><Gift size={24} /></div>
                        <div>
                          <h4 className="font-bold text-white text-xl">The Crypto Gifting Way</h4>
                          <p className="text-gray-400">Universal value. Swap, save, or spend. Potential to grow.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeComparison === 'cash' && (
                    <div className="space-y-8">
                       <div className="flex items-center gap-6 mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-green-500/20 to-transparent border border-green-500/20 rounded-2xl flex items-center justify-center text-green-500 shadow-[0_0_30px_-10px_rgba(34,197,94,0.3)]">
                          <TrendingUp size={32} />
                        </div>
                        <h3 className="text-4xl font-bold">The Inflation Problem</h3>
                      </div>
                      <ul className="space-y-5">
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> Cash loses 3-7% purchasing power yearly</li>
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> Boring—feels like a "transaction"</li>
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> No educational value</li>
                      </ul>
                      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8" />
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-500"><Gift size={24} /></div>
                        <div>
                          <h4 className="font-bold text-white text-xl">The Crypto Gifting Way</h4>
                          <p className="text-gray-400">Give assets that appreciate. You're giving a future, not just funds.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeComparison === 'stocks' && (
                    <div className="space-y-8">
                       <div className="flex items-center gap-6 mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-yellow-500/20 to-transparent border border-yellow-500/20 rounded-2xl flex items-center justify-center text-yellow-500 shadow-[0_0_30px_-10px_rgba(234,179,8,0.3)]">
                          <Globe size={32} />
                        </div>
                        <h3 className="text-4xl font-bold">The Setup Nightmare</h3>
                      </div>
                      <ul className="space-y-5">
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> Requires Social Security Numbers</li>
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> Days of KYC/Identity verification</li>
                        <li className="flex items-center gap-4 text-lg text-gray-300"><X className="text-red-500 w-6 h-6" /> Intimidating for beginners</li>
                      </ul>
                      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8" />
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-500"><Gift size={24} /></div>
                        <div>
                          <h4 className="font-bold text-white text-xl">The Crypto Gifting Way</h4>
                          <p className="text-gray-400">Instant. No SSN to receive. As easy as opening an email.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* --- RISK REVERSAL --- */}
      <section className="py-32 px-6 bg-gradient-to-b from-[#080808] to-[#111] relative overflow-hidden z-10 contain-paint">
        {/* Background Glow - Static */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-green-900/10 rounded-full blur-[120px] pointer-events-none will-change-transform" />

        <div className="max-w-4xl mx-auto relative z-10">
           <motion.div 
             whileHover={{ scale: 1.01 }}
             transition={{ duration: 0.3 }}
             className="bg-[#1a1a1a]/80 backdrop-blur-2xl rounded-[3rem] p-12 border border-white/10 relative overflow-hidden shadow-2xl transform-gpu"
           >
              <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12 transform translate-x-10 -translate-y-10">
                 <ShieldCheck size={240} />
              </div>
              
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 rounded-lg font-bold mb-8 border border-green-500/20">
                  <Clock className="w-5 h-5" /> 
                  The 48-Hour Guarantee
                </div>
                <h2 className="text-4xl md:text-5xl font-bold mb-8">What if they don't open it?</h2>
                <p className="text-xl text-gray-400 mb-10 max-w-2xl leading-relaxed">
                  We know the fear: "I send money, and it disappears into the void." <br/><br/>
                  <strong>Not here.</strong> If your friend doesn't claim their gift within 48 hours, the money is 
                  <span className="text-white font-bold border-b border-green-500/50 mx-2">automatically refunded</span> to your account.
                </p>
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-black">
                      <ShieldCheck className="w-6 h-6" />
                   </div>
                   <div>
                     <p className="text-lg text-white font-bold">Zero Risk Guarantee</p>
                     <p className="text-sm text-gray-500">Either they get the gift, or you get your money back.</p>
                   </div>
                </div>
              </div>
           </motion.div>
        </div>
      </section>

      {/* --- FAQ --- */}
      <section className="py-32 px-6 z-10 relative">
        <div className="max-w-3xl mx-auto space-y-12">
          <h2 className="text-4xl font-bold text-center">Questions You Might Have</h2>
          
          <div className="grid gap-6">
            {[
              { q: "Do they need an app?", a: "No. They receive an email. They click a link. That's it. A secure account is created for them in the browser instantly." },
              { q: "Is it safe?", a: "Yes. The link we send is a \"Magic Link\" secured by bank-grade encryption. Only the person with access to that email address can claim the funds." },
              { q: "What assets can I send?", a: "You can send Bitcoin, Crypto, Stablecoins, Tokenized Stocks, Tokenized Gold, or other major assets. The recipient sees the value immediately." }
            ].map((item, i) => (
              <div key={i} className="p-8 rounded-3xl bg-[#111] border border-white/5 hover:border-white/10 transition-colors">
                <h3 className="font-bold text-xl mb-3 text-white">{item.q}</h3>
                <p className="text-gray-400 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- FINAL CTA --- */}
      <section className="py-40 px-6 text-center relative overflow-hidden z-10 contain-paint">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-900/10" />
        
        <div className="max-w-3xl mx-auto space-y-10 relative z-10">
          <h2 className="text-5xl md:text-8xl font-bold tracking-tighter leading-none">
            Be the <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500">Coolest Friend</span><br /> They Have.
          </h2>
          <p className="text-xl text-gray-400">
            Send your first gift in 60 seconds. It's free to try.
          </p>
          <MagneticButton className="group relative px-12 py-6 bg-white text-black font-bold text-xl rounded-full shadow-[0_0_50px_-15px_rgba(255,255,255,0.5)] hover:shadow-[0_0_80px_-20px_rgba(120,119,198,0.6)] overflow-hidden transition-all duration-500 hover:scale-105 transform-gpu">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 will-change-transform" />
            {/* Adding a subtle shine animation on top of the gradient */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 duration-500">
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            </div>
            
            <span className="relative z-10 group-hover:text-white transition-colors duration-300 flex items-center gap-2">
              Start Gifting Now
            </span>
          </MagneticButton>
          <p className="text-sm text-gray-600">No credit card required for setup.</p>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="py-12 text-center text-gray-600 text-sm border-t border-white/5 bg-[#050505] relative z-10">
        <p>© 2025 Crypto Gifting App. All rights reserved.</p>
        <p className="mt-2 opacity-50">Powered by Sher.</p>
      </footer>

    </div>
  );
};

export default LandingPage;