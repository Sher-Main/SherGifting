import React, { useEffect, useState } from 'react';
import { usernameService } from '../services/api';
import './UsernameSetupModal.css';

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
    <div className="username-modal__overlay" role="dialog" aria-modal="true">
      <div className="username-modal__content">
        <h2>Choose your username</h2>
        <p className="username-modal__subtitle">
          This will be your @handle for receiving gifts.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="username-input">Username</label>
          <input
            id="username-input"
            type="text"
            value={username}
            onChange={handleInputChange}
            placeholder="@yourname"
            maxLength={30}
            autoFocus
            disabled={submitting}
            className={
              username
                ? available
                  ? 'username-modal__input success'
                  : available === false
                    ? 'username-modal__input error'
                    : 'username-modal__input'
                : 'username-modal__input'
            }
          />

          <div className="username-modal__feedback">
            {checking && <span>Checking availability...</span>}
            {!checking && username.length >= USERNAME_MIN_LENGTH && available && (
              <span className="success">✓ Available</span>
            )}
            {!checking && username.length >= USERNAME_MIN_LENGTH && available === false && !error && (
              <span className="error">✗ Taken</span>
            )}
            {error && <span className="error">{error}</span>}
          </div>

          <div className="username-modal__rules">
            <p>Username rules:</p>
            <ul>
              <li>Must start with @</li>
              <li>4-30 characters</li>
              <li>Letters, numbers, underscores only</li>
            </ul>
          </div>

          <div className="username-modal__actions">
            <button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              disabled={!canSubmit}
            >
              {submitting ? 'Saving...' : 'Confirm username'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UsernameSetupModal;

