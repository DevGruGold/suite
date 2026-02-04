import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Building2, Globe, Mail, Phone, Github, Server,
  Plus, Trash2, Save, X, Briefcase, Link2, Key
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { OrganizationKeysDialog } from "./OrganizationKeysDialog";

interface Organization {
  id: string;
  name: string;
  website: string | null;
  email: string | null;
  whatsapp_number: string | null;
  github_repo: string | null;
  mcp_server_address: string | null;
  connections: any;
  typefully_set?: string;
}

export const OrganizationProfile = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Keys Dialog State
  const [keysDialogOpen, setKeysDialogOpen] = useState(false);
  const [selectedOrgForKeys, setSelectedOrgForKeys] = useState<Organization | null>(null);

  const [formData, setFormData] = useState<Partial<Organization>>({
    name: '',
    website: '',
    email: '',
    whatsapp_number: '',
    github_repo: '',
    mcp_server_address: '',
    typefully_set: '',
    connections: {}
  });

  useEffect(() => {
    if (user) {
      fetchOrganizations();
    }
  }, [user]);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrganizations(data || []);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!formData.name) {
      toast.error('Organization name is required');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('organizations')
          .update(formData)
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Organization updated');
      } else {
        const { error } = await supabase
          .from('organizations')
          .insert([{ ...formData, owner_id: user.id }]);
        if (error) throw error;
        toast.success('Organization added');
      }

      setIsAdding(false);
      setEditingId(null);
      setFormData({
        name: '',
        website: '',
        email: '',
        whatsapp_number: '',
        github_repo: '',
        mcp_server_address: '',
        typefully_set: '',
        connections: {}
      });
      fetchOrganizations();
    } catch (err) {
      console.error('Error saving organization:', err);
      toast.error('Failed to save organization');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this organization?')) return;

    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Organization deleted');
      fetchOrganizations();
    } catch (err) {
      console.error('Error deleting organization:', err);
      toast.error('Failed to delete organization');
    }
  };

  const handleSelect = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ selected_organization_id: id })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Organization selected for AI context');
      refreshProfile();
    } catch (err) {
      console.error('Error selecting organization:', err);
      toast.error('Failed to select organization');
    }
  };

  const startEditing = (org: Organization) => {
    setEditingId(org.id);
    setFormData(org);
    setIsAdding(true);
  };

  if (loading) return <div className="p-4 text-center">Loading organizations...</div>;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" />
            Business & Organizations
          </CardTitle>
          <CardDescription>
            Customize Eliza's focus by adding your business details
          </CardDescription>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add New
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdding && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Organization Name *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={formData.website || ''}
                  onChange={e => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={formData.email || ''}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp Number</Label>
                <Input
                  value={formData.whatsapp_number || ''}
                  onChange={e => setFormData({ ...formData, whatsapp_number: e.target.value })}
                  placeholder="+1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label>GitHub Repo</Label>
                <Input
                  value={formData.github_repo || ''}
                  onChange={e => setFormData({ ...formData, github_repo: e.target.value })}
                  placeholder="owner/repo"
                />
              </div>
              <div className="space-y-2">
                <Label>MCP Server Address</Label>
                <Input
                  value={formData.mcp_server_address || ''}
                  onChange={e => setFormData({ ...formData, mcp_server_address: e.target.value })}
                  placeholder="http://localhost:3000"
                />
              </div>
              <div className="space-y-2">
                <Label>Typefully Set (Social Content)</Label>
                <Input
                  value={formData.typefully_set || ''}
                  onChange={e => setFormData({ ...formData, typefully_set: e.target.value })}
                  placeholder="e.g. My Tech Brand"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setIsAdding(false); setEditingId(null); }}>
                <X className="w-4 h-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" /> {editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4">
          {organizations.length === 0 && !isAdding && (
            <p className="text-center text-muted-foreground py-8">No organizations added yet.</p>
          )}
          {organizations.map(org => (
            <div key={org.id} className={`p-4 border rounded-lg flex flex-col sm:flex-row justify-between gap-4 ${profile?.selected_organization_id === org.id ? 'border-primary bg-primary/5' : ''}`}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-lg">{org.name}</h3>
                  {profile?.selected_organization_id === org.id && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Active Context</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  {org.website && <div className="flex items-center gap-1"><Globe className="w-3 h-3" /> {org.website}</div>}
                  {org.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {org.email}</div>}
                  {org.whatsapp_number && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {org.whatsapp_number}</div>}
                  {org.github_repo && <div className="flex items-center gap-1"><Github className="w-3 h-3" /> {org.github_repo}</div>}
                  {org.mcp_server_address && <div className="flex items-center gap-1"><Server className="w-3 h-3" /> {org.mcp_server_address}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                {profile?.selected_organization_id !== org.id && (
                  <Button variant="outline" size="sm" onClick={() => handleSelect(org.id)}>
                    <Link2 className="w-4 h-4 mr-2" /> Select
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => { setSelectedOrgForKeys(org); setKeysDialogOpen(true); }}>
                  <Key className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => startEditing(org)}>
                  <Plus className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(org.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <OrganizationKeysDialog
        open={keysDialogOpen}
        onOpenChange={setKeysDialogOpen}
        organizationId={selectedOrgForKeys?.id || null}
        organizationName={selectedOrgForKeys?.name || ''}
      />
    </Card >
  );
};
