import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { getProfile, upsertProfile } from '../data/profiles';
import { useSession } from '../hooks/useSession';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/ToastProvider';
import appIcon from '../assets/icon.svg';

type AuthMode = 'login' | 'register' | 'magic';

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { showToast } = useToast();
  const [mode, setMode] = useState<AuthMode>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string; base_currency: string } | null>(null);

  const [form, setForm] = useState({ email: '', password: '' });
  const [profileForm, setProfileForm] = useState({ display_name: '', base_currency: 'EUR' });

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    getProfile()
      .then((data) => {
        if (data) {
          setProfile({ display_name: data.display_name ?? '', base_currency: data.base_currency ?? 'EUR' });
          setProfileForm({ display_name: data.display_name ?? '', base_currency: data.base_currency ?? 'EUR' });
        } else {
          setProfile(null);
        }
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : 'No se pudo cargar el perfil.', 'error');
      })
      .finally(() => setProfileLoading(false));
  }, [session, showToast]);

  useEffect(() => {
    if (session && profile) {
      navigate('/dashboard', { replace: true });
    }
  }, [session, profile, navigate]);

  const handleAuth = async () => {
    if (!isSupabaseConfigured) return;
    if (!form.email) {
      showToast('Ingresa tu email.', 'error');
      return;
    }
    if (mode !== 'magic' && !form.password) {
      showToast('Ingresa tu contrasena.', 'error');
      return;
    }
    setAuthLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: form.email,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        showToast('Revisa tu correo para el enlace magico.', 'success');
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('Invalid login credentials')
          ? 'Credenciales invalidas o email sin confirmar.'
          : err instanceof Error
          ? err.message
          : 'No se pudo autenticar.';
      showToast(message, 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleProfile = async () => {
    if (!profileForm.display_name.trim()) {
      showToast('Ingresa tu nombre.', 'error');
      return;
    }
    setProfileLoading(true);
    try {
      const updated = await upsertProfile({
        display_name: profileForm.display_name.trim(),
        base_currency: profileForm.base_currency.toUpperCase() || 'EUR',
      });
      setProfile({ display_name: updated.display_name ?? '', base_currency: updated.base_currency });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar el perfil.', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6">
        <EmptyState
          title="Configura Supabase"
          description="Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local para continuar."
        />
      </div>
    );
  }

  if (loading) {
    return <LoadingState label="Verificando sesion..." />;
  }

  if (session && profileLoading) {
    return <LoadingState label="Cargando perfil..." />;
  }

  if (session && !profile) {
    return (
      <div className="flex h-screen flex-col bg-background-light dark:bg-background-dark p-6">
        <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
          <div className="w-full max-w-[280px] rounded-[32px] bg-white dark:bg-slate-800/50 flex items-center justify-center p-8 shadow-2xl border border-white dark:border-slate-700">
            <span className="material-symbols-outlined text-[64px] text-primary">person</span>
          </div>
          <div>
            <h1 className="text-slate-900 dark:text-white text-[28px] font-extrabold leading-tight mb-4 tracking-tighter">
              Completa tu perfil
            </h1>
            <p className="text-slate-500 text-base leading-relaxed max-w-[280px] mx-auto">
              Define tu nombre y moneda base para empezar.
            </p>
          </div>
        </div>
        <div className="pb-12 space-y-4">
          <input
            className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-4 text-sm"
            placeholder="Tu nombre"
            value={profileForm.display_name}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, display_name: event.target.value }))}
          />
          <input
            className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-4 text-sm"
            placeholder="Moneda base (EUR)"
            value={profileForm.base_currency}
            onChange={(event) => setProfileForm((prev) => ({ ...prev, base_currency: event.target.value }))}
          />
          <button
            onClick={handleProfile}
            className="w-full h-14 bg-primary text-white font-bold rounded-2xl text-lg flex items-center justify-center gap-2 shadow-xl shadow-primary/20 transition-transform active:scale-95"
            disabled={profileLoading}
          >
            {profileLoading ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background-light dark:bg-background-dark p-6">
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
        <div className="relative w-full aspect-square max-w-[280px] rounded-[32px] bg-white dark:bg-slate-800/50 flex items-center justify-center p-8 shadow-2xl border border-white dark:border-slate-700">
          <img src={appIcon} alt="FinanceFlow" className="w-24 h-24" />
        </div>
        <div>
          <h1 className="text-slate-900 dark:text-white text-[32px] font-extrabold leading-tight mb-4 tracking-tighter">
            Centraliza tu patrimonio
          </h1>
          <p className="text-slate-500 text-base leading-relaxed max-w-[280px] mx-auto">
            Visualiza todas tus cuentas bancarias, portafolios y objetivos en un solo lugar seguro.
          </p>
        </div>
      </div>
      <div className="pb-12 space-y-6 flex flex-col items-center">
        <div className="flex gap-2">
          {(['login', 'register', 'magic'] as AuthMode[]).map((item) => (
            <button
              key={item}
              className={`h-2 rounded-full transition-all ${mode === item ? 'w-8 bg-primary' : 'w-2 bg-slate-300'}`}
              onClick={() => setMode(item)}
            />
          ))}
        </div>
        <div className="w-full space-y-3">
          <input
            className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-4 text-sm"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          {mode !== 'magic' && (
            <input
              className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-4 text-sm"
              placeholder="Contrasena"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          )}
        </div>
        <button
          onClick={handleAuth}
          className="w-full h-14 bg-primary text-white font-bold rounded-2xl text-lg flex items-center justify-center gap-2 shadow-xl shadow-primary/20 transition-transform active:scale-95"
          disabled={authLoading}
        >
          {authLoading
            ? 'Procesando...'
            : mode === 'login'
            ? 'Entrar'
            : mode === 'register'
            ? 'Crear cuenta'
            : 'Enviar enlace'}
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
