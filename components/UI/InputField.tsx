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
  helperText?: string;
  error?: string;
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
  helperText,
  error,
  className = "",
  ...inputProps
}) => {
  const hasError = Boolean(error);
  const borderColor = hasError
    ? 'border-[#EF4444] group-focus-within:border-[#EF4444]'
    : 'border-white/10 group-focus-within:border-[#BE123C]';
  const ringColor = hasError
    ? 'group-focus-within:ring-[#EF4444]/10'
    : 'group-focus-within:ring-[#BE123C]/10';

  return (
    <div className={`group space-y-2 w-full ${className}`}>
      <div className="flex justify-between items-baseline">
        {label && <label className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] ml-1">{label}</label>}
        {subLabel && <span className="text-xs text-[#64748B]">{subLabel}</span>}
      </div>
      <div className={`relative flex items-center bg-[#0F172A]/50 border ${borderColor} rounded-xl px-4 py-3.5 transition-all duration-300 group-focus-within:ring-4 ${ringColor} group-focus-within:bg-[#0F172A]`}>
        {Icon && <Icon size={18} className={`mr-3 transition-colors ${hasError ? 'text-[#EF4444]' : 'text-[#64748B] group-focus-within:text-[#BE123C]'}`} />}
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
      {(helperText || error) && (
        <p className={`text-xs mt-1 ml-1 ${hasError ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
};

export default InputField;

