import React from 'react';
import { motion } from 'framer-motion';
import GlassCard from '../UI/GlassCard';

const FAQ: React.FC = () => {
  const faqs = [
    {
      question: "Do they need an app?",
      answer: "No. They receive an email. They click a link. That's it. A secure account is created for them in the browser instantly.",
    },
    {
      question: "Is it safe?",
      answer: "Yes. The link we send is a \"Magic Link\" secured by bank-grade encryption. Only the person with access to that email address can claim the funds.",
    },
    {
      question: "What assets can I send?",
      answer: "You can send Bitcoin, Crypto, Stablecoins, Tokenized Stocks, Tokenized Gold, or other major assets. The recipient sees the value immediately.",
    },
  ];

  return (
    <section id="faq" className="py-16 lg:py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 lg:mb-16"
        >
          <h2 className="text-h2 font-bold text-white mb-4">Questions You Might Have</h2>
        </motion.div>

        <div className="grid gap-6">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <GlassCard className="p-8 hover:border-white/10 transition-colors">
                <h3 className="font-bold text-xl mb-3 text-white">{faq.question}</h3>
                <p className="text-[#94A3B8] leading-relaxed">{faq.answer}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;

