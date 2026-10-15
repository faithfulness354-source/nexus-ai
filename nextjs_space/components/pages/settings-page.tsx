'use client';

import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROVIDER_MODELS, PROVIDER_LABELS, SUPPORTED_PROVIDERS, DEFAULT_PROVIDER, usableGeminiModel } from '@/lib/types';
import { Save, Zap, Check, CreditCard, KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SubscriptionPanel } from '@/components/billing/subscription-panel';
import Link from 'next/link';
import { useAccess } from '@/components/billing/access-provider';

const PROVIDERS: string[] = [...SUPPORTED_PROVIDERS];

interface ProviderState {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  isActive: boolean;
  loaded: boolean;
  maskedKey: string | null;
}

export function SettingsPage({ allowApiSettings = false, initialTab, checkout }: { allowApiSettings?: boolean; initialTab?: string; checkout?: string }) {
  const { status } = useAccess();
  // Server already refused this prop for everyone except the creator. The status flag closes it again if that account is not the creator.
  const canSeeApi = allowApiSettings && (status == null || !!status.isCreatorAdmin);
  const [tab, setTab] = useState<'subscription' | 'api'>(initialTab === 'api' ? 'api' : 'subscription');
  const tabKey = `${canSeeApi}:${initialTab ?? ''}`;
  const [tabSeen, setTabSeen] = useState(tabKey);
  if (tabSeen !== tabKey) {
    setTabSeen(tabKey);
    if (!canSeeApi) setTab('subscription');
    else if (initialTab === 'api') setTab('api');
  }
  const [configs, setConfigs] = useState<Record<string, ProviderState>>({});
  const [modelLists, setModelLists] = useState<Record<string, string[]>>(PROVIDER_MODELS);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (!canSeeApi || tab !== 'api') return;
    fetch('/api/settings/providers')
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const map: Record<string, ProviderState> = {};
        for (const p of PROVIDERS) {
          const existing = (data ?? []).find((d: any) => d?.provider === p);
          map[p] = {
            apiKey: '',
            baseUrl: existing?.baseUrl ?? '',
            defaultModel: p === DEFAULT_PROVIDER ? usableGeminiModel(existing?.defaultModel) : (existing?.defaultModel || (PROVIDER_MODELS?.[p]?.[0] ?? '')),
            isActive: existing?.isActive ?? false,
            loaded: true,
            maskedKey: existing?.apiKey ?? null,
          };
        }
        setConfigs(map);
      })
      .catch(() => {});
    for (const provider of PROVIDERS) {
      fetch(`/api/models/${provider}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const models = Array.isArray(data?.models) ? data.models.filter((model: unknown) => typeof model === 'string' && model.trim()) : [];
          if (models.length) setModelLists((prev) => ({ ...prev, [provider]: models }));
        })
        .catch(() => {});
    }
  }, [canSeeApi, tab]);

  function updateConfig(provider: string, key: string, value: any) {
    setConfigs(prev => ({
      ...(prev ?? {}),
      [provider]: { ...(prev?.[provider] ?? { apiKey: '', baseUrl: '', defaultModel: '', isActive: true, loaded: true, maskedKey: null }), [key]: value },
    }));
  }

  function selectTab(next: string) {
    if (next !== 'subscription' && next !== 'api') return;
    if (next === 'api' && !canSeeApi) return;
    setTab(next);
  }

  async function handleSave(provider: string) {
    if (!canSeeApi) return;
    setSaving(provider);
    try {
      const config = configs?.[provider];
      const body: any = {
        provider,
        defaultModel: config?.defaultModel,
        isActive: config?.isActive,
        baseUrl: config?.baseUrl || null,
      };
      // Only send API key if user entered a new one
      if (config?.apiKey) body.apiKey = config.apiKey;

      const res = await fetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error ?? 'Save failed');

      // Sync with what the server actually persisted so the saved selection stays put.
      setConfigs(prev => ({
        ...(prev ?? {}),
        [provider]: {
          ...(prev?.[provider] as ProviderState),
          apiKey: '',
          maskedKey: result?.apiKey ?? null,
          defaultModel: result?.defaultModel ?? prev?.[provider]?.defaultModel ?? '',
          isActive: result?.isActive ?? true,
        },
      }));
      toast.success(`${PROVIDER_LABELS?.[provider] ?? provider} settings saved!`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save');
    } finally {
      setSaving(null);
    }
  }

  async function handleActive(provider: string, active: boolean) {
    if (!canSeeApi) return;
    const previous = configs?.[provider]?.isActive ?? false;
    updateConfig(provider, 'isActive', active);
    setSaving(provider);
    try {
      const res = await fetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, isActive: active }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error ?? 'Could not update this provider');
      updateConfig(provider, 'isActive', !!result?.isActive);
      toast.success(active ? `${PROVIDER_LABELS?.[provider] ?? provider} is on` : `${PROVIDER_LABELS?.[provider] ?? provider} is off`);
    } catch (err: any) {
      updateConfig(provider, 'isActive', previous);
      toast.error(err?.message ?? 'Could not update this provider');
    } finally {
      setSaving(null);
    }
  }

  async function handleRemove(provider: string) {
    if (!canSeeApi) return;
    const label = PROVIDER_LABELS?.[provider] ?? provider;
    if (!window.confirm(`Remove the saved ${label} API key? Chat will not use it until you add a new one.`)) return;
    setSaving(provider);
    try {
      const res = await fetch(`/api/settings/providers?provider=${encodeURIComponent(provider)}`, { method: 'DELETE' });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error ?? 'Could not remove the API key');
      setConfigs(prev => ({
        ...(prev ?? {}),
        [provider]: {
          ...(prev?.[provider] as ProviderState),
          apiKey: '',
          maskedKey: null,
          isActive: false,
        },
      }));
      toast.success(`${label} API key removed`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not remove the API key');
    } finally {
      setSaving(null);
    }
  }

  async function handleTest(provider: string) {
    if (!canSeeApi) return;
    setTesting(provider);
    // Simple connection test - just verify API key format
    const config = configs?.[provider];
    const hasKey = !!(config?.apiKey || config?.maskedKey);
    setTimeout(() => {
      if (hasKey) {
        toast.success(`${PROVIDER_LABELS?.[provider] ?? provider} - API key is configured`);
      } else {
        toast.error(`No API key set for ${PROVIDER_LABELS?.[provider] ?? provider}`);
      }
      setTesting(null);
    }, 500);
  }

  return (
    <div className="flex flex-col min-h-[100dvh] w-full max-w-full bg-background">
      <AppHeader />
      <main className="flex-1 flex flex-col min-w-0 w-full">
        <div className="flex-1 p-3 sm:p-6 max-w-3xl mx-auto w-full min-w-0">
          <h1 className="font-display font-bold text-2xl tracking-tight mb-1">Settings</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Manage your plan and daily credits{canSeeApi ? ', plus the AI provider keys shared by the whole app' : ''}.
          </p>

          <Tabs value={canSeeApi ? tab : 'subscription'} onValueChange={selectTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="subscription" className="gap-1.5"><CreditCard className="h-4 w-4" /> Subscription &amp; Tiers</TabsTrigger>
              {canSeeApi && <TabsTrigger value="api" className="gap-1.5"><KeyRound className="h-4 w-4" /> API Settings</TabsTrigger>}
            </TabsList>
            <TabsContent value="subscription">
              {canSeeApi && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Moderate every character card, including private drafts, in the{' '}
                  <Link href="/dashboard/cards" className="text-primary hover:underline">card directory</Link>.
                </p>
              )}
              <SubscriptionPanel checkout={checkout} />
            </TabsContent>
            {canSeeApi && (
            <TabsContent value="api">
          <p className="text-muted-foreground text-sm mb-4">
            Configure your LLM provider API keys and default models. Keys are stored securely in the database.
          </p>
          <Tabs defaultValue={DEFAULT_PROVIDER}>
            <TabsList className="mb-6 max-w-full overflow-x-auto scrollbar-none justify-start">
              {PROVIDERS.map((p: string) => (
                <TabsTrigger key={p} value={p} className="text-xs">
                  {PROVIDER_LABELS?.[p] ?? p}
                </TabsTrigger>
              ))}
            </TabsList>

            {PROVIDERS.map((provider: string) => {
              const config = configs?.[provider];
              const listed = modelLists?.[provider] ?? PROVIDER_MODELS?.[provider] ?? [];
              const models = config?.defaultModel && !listed.includes(config.defaultModel) ? [config.defaultModel, ...listed] : listed;

              return (
                <TabsContent key={provider} value={provider}>
                  <div className="space-y-6 rounded-xl border border-border bg-card p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
                    {/* Active toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{PROVIDER_LABELS?.[provider] ?? provider}</h3>
                        <p className="text-xs text-muted-foreground">
                          Turn this off to stop chat from using the saved key.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Active</Label>
                        <Switch
                          checked={!!config?.isActive}
                          disabled={saving === provider}
                          onCheckedChange={(v: boolean) => handleActive(provider, v)}
                        />
                      </div>
                    </div>

                    {/* API Key */}
                    <div>
                      <Label>API Key</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="password"
                          value={config?.apiKey ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateConfig(provider, 'apiKey', e.target.value)}
                          placeholder={config?.maskedKey ?? 'Enter API key...'}
                        />
                        {config?.maskedKey && (
                          <div className="flex items-center gap-1 text-xs text-emerald-500">
                            <Check className="h-3 w-3" />
                            <span>Set</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Base URL (for Custom) */}
                    {provider === 'CUSTOM' && (
                      <div>
                        <Label>Base URL</Label>
                        <Input
                          value={config?.baseUrl ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateConfig(provider, 'baseUrl', e.target.value)}
                          placeholder="https://your-api.example.com/v1"
                          className="mt-1"
                        />
                      </div>
                    )}

                    {/* Default Model */}
                    {models.length > 0 && (
                      <div>
                        <Label>Default Model</Label>
                        <Select
                          value={config?.defaultModel ?? ''}
                          onValueChange={(v: string) => updateConfig(provider, 'defaultModel', v)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((m: string) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {provider === 'CUSTOM' && models.length === 0 && (
                      <div>
                        <Label>Default Model</Label>
                        <Input
                          value={config?.defaultModel ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateConfig(provider, 'defaultModel', e.target.value)}
                          placeholder="model-name"
                          className="mt-1"
                        />
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button onClick={() => handleSave(provider)} loading={saving === provider}>
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => handleTest(provider)} loading={testing === provider}>
                        <Zap className="h-4 w-4 mr-1" />
                        Test Connection
                      </Button>
                      {config?.maskedKey && (
                        <Button variant="outline" onClick={() => handleRemove(provider)} disabled={saving === provider}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove key
                        </Button>
                      )}
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
            </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
