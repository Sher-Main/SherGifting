'use client';

import React, { useState } from 'react';

interface MessageStepProps {
  initialValue?: string;
  onNext: (data: { message?: string }) => void;
  onBack: () => void;
}

const MESSAGE_TEMPLATES = [
  "Happy Birthday! 🎉",
  "Congratulations! 🎊",
  "Thank you! 🙏",
  "Thinking of you ❤️",
  "Good luck! 🍀",
];

export const MessageStep: React.FC<MessageStepProps> = ({ 
  initialValue = '', 
  onNext, 
  onBack 
}) => {
  const [message, setMessage] = useState(initialValue);

  const handleSkip = () => {
    onNext({ message: undefined });
  };

  const handleSubmit = () => {
    onNext({ message: message.trim() || undefined });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 text-white">Add a message</h2>
        <p className="text-slate-400">Make it personal (optional)</p>
      </div>
      
      {/* Quick templates */}
      <div>
        <p className="text-sm font-medium mb-3 text-slate-300">Quick messages:</p>
        <div className="flex flex-wrap gap-2">
          {MESSAGE_TEMPLATES.map(template => (
            <button
              key={template}
              onClick={() => setMessage(template)}
              className="px-4 py-2 bg-slate-700 hover:bg-sky-500/20 border border-slate-600 hover:border-sky-500 rounded-full text-sm transition text-slate-300"
            >
              {template}
            </button>
          ))}
        </div>
      </div>
      
      {/* Custom message */}
      <div>
        <textarea
          placeholder="Write your own message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-4 py-3 border-2 border-slate-600 bg-slate-900 text-white rounded-lg focus:border-sky-500 focus:outline-none resize-none"
          rows={4}
          maxLength={200}
        />
        <p className="text-xs text-slate-500 text-right mt-1">
          {message.length}/200 characters
        </p>
      </div>
      
      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border-2 border-slate-600 text-slate-300 py-3 rounded-lg font-semibold hover:bg-slate-700 transition"
        >
          ← Back
        </button>
        <button
          onClick={handleSkip}
          className="flex-1 border-2 border-sky-500 text-sky-400 py-3 rounded-lg font-semibold hover:bg-sky-500/10 transition"
        >
          Skip
        </button>
        <button
          onClick={handleSubmit}
          className="flex-1 bg-gradient-to-r from-sky-500 to-cyan-400 text-white py-3 rounded-lg font-semibold hover:from-sky-600 hover:to-cyan-500 transition"
        >
          Next →
        </button>
      </div>
    </div>
  );
};

