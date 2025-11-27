import React from 'react';
import { LucideIcon } from 'lucide-react';

interface InputFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon?: LucideIcon;
  rightElement?: React.ReactNode;
  subLabel?: string;
  className?: string;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  icon: Icon,
  rightElement,
  subLabel,
  className = "",
  ...inputProps
}) => {
  return (
    <div className={`group space-y-2 w-full ${className}`}>
      <div className="flex justify-between items-baseline">
        {label && <label className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] ml-1">{label}</label>}
        {subLabel && <span className="text-xs text-[#64748B]">{subLabel}</span>}
      </div>
      <div className="relative flex items-center bg-[#0F172A]/50 border border-white/10 rounded-xl px-4 py-3.5 transition-all duration-300 group-focus-within:border-[#BE123C] group-focus-within:ring-4 group-focus-within:ring-[#BE123C]/10 group-focus-within:bg-[#0F172A]">
        {Icon && <Icon size={18} className="text-[#64748B] mr-3 group-focus-within:text-[#BE123C] transition-colors" />}
        <input 
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="w-full bg-transparent outline-none text-white placeholder:text-[#475569] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          {...inputProps}
        />
        {rightElement}
      </div>
    </div>
  );
};

export default InputField;

