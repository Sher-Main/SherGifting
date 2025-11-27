import React, { useEffect, useState } from 'react';
import { usernameService } from '../services/api';
import { AtSign, Check } from 'lucide-react';
import GlassCard from './UI/GlassCard';
import InputField from './UI/InputField';
import GlowButton from './UI/GlowButton';

interface UsernameSetupModalProps {
  isOpen: boolean;
  onSuccess: (username: string) => void | Promise<void>;
}

const USERNAME_MIN_LENGTH = 4;

const UsernameSetupModal: React.FC<UsernameSetupModalProps> = ({
  isOpen,
  onSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setUsername('');
      setAvailable(null);
      setError('');
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!username || username.length < USERNAME_MIN_LENGTH) {
      setAvailable(null);
      setError('');
      return;
    }

    const timeoutId = setTimeout(() => {
      void checkUsername();
    }, 500);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const checkUsername = async () => {
    if (!username.startsWith('@')) {
      setError('Username must start with @');
      setAvailable(false);
      return;
    }

    setChecking(true);
    setError('');

    try {
      const response = await usernameService.checkAvailability(username);
      if (response.error) {
        setError(response.error);
        setAvailable(false);
      } else {
        setAvailable(response.available);
        if (!response.available) {
          setError('Username already taken');
        }
      }
    } catch (err) {
      console.error('❌ Username check failed:', err);
      setError('Failed to check username');
      setAvailable(false);
    } finally {
      setChecking(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let value = event.target.value.toLowerCase();

    if (value && !value.startsWith('@')) {
      value = `@${value}`;
    }

    value = value.replace(/[^@a-z0-9_]/g, '');
    setUsername(value);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!username || !available || checking || submitting) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await usernameService.setUsername(username);
      if (response.success) {
        await onSuccess(username);
        setSubmitting(false);
        return;
      }
      setError(response.error || 'Failed to set username');
    } catch (err: any) {
      console.error('❌ Error setting username:', err);
      setError(err?.response?.data?.error || 'Failed to set username');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  const canSubmit = Boolean(username && available && !checking && !submitting);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-[2000] bg-[#0B1120]/85 backdrop-blur-md" role="dialog" aria-modal="true">
      <GlassCard className="w-full max-w-md p-8 md:p-10 animate-scale-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#BE123C]/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#BE123C]/20 shadow-[0_0_15px_rgba(190,18,60,0.2)]">
            <AtSign strokeWidth={1.5} size={32} className="text-[#BE123C]" />
          </div>
          <h2 className="text-2xl font-bold text-white">Choose your username</h2>
          <p className="text-[#94A3B8] mt-2">This will be your @handle for receiving gifts.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <InputField
              label="Username"
              placeholder="@yourname"
              value={username}
              onChange={handleInputChange}
              maxLength={30}
              autoFocus
              disabled={submitting}
            />
            <div className="mt-2 min-h-[24px]">
              {checking && (
                <span className="text-xs text-[#94A3B8] text-center block">Checking availability...</span>
              )}
              {!checking && username.length >= USERNAME_MIN_LENGTH && available && (
                <span className="text-xs text-[#10B981] text-center block">✓ Available</span>
              )}
              {!checking && username.length >= USERNAME_MIN_LENGTH && available === false && !error && (
                <span className="text-xs text-[#EF4444] text-center block">✗ Taken</span>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-lg p-3 text-xs text-[#EF4444]">
              {error}
            </div>
          )}

          <div className="bg-[#0F172A]/40 rounded-xl p-4 text-xs space-y-2 border border-white/5 text-[#94A3B8]">
            <p className="font-bold uppercase tracking-wider text-[#64748B] mb-2">Username Rules:</p>
            <div className="flex items-center gap-2">
              <Check size={12} className="text-[#10B981]" />
              <span>Must start with @</span>
            </div>
            <div className="flex items-center gap-2">
              <Check size={12} className="text-[#10B981]" />
              <span>4-30 characters</span>
            </div>
            <div className="flex items-center gap-2">
              <Check size={12} className="text-[#10B981]" />
              <span>Letters, numbers, underscores only</span>
            </div>
          </div>

          <GlowButton
            type="submit"
            fullWidth
            variant="primary"
            disabled={!canSubmit}
          >
            {submitting ? 'Saving...' : 'Confirm Username'}
          </GlowButton>
        </form>
      </GlassCard>
    </div>
  );
};

export default UsernameSetupModal;

