import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, Users, Settings, Crown, UserCog } from 'lucide-react';

type AppRole = 'user' | 'contributor' | 'moderator' | 'admin' | 'superadmin';

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  roles: AppRole[];
}

const ROLE_COLORS: Record<AppRole, string> = {
  user: 'bg-slate-500',
  contributor: 'bg-blue-500',
  moderator: 'bg-green-500',
  admin: 'bg-orange-500',
  superadmin: 'bg-purple-500',
};

const ROLE_LABELS: Record<AppRole, string> = {
  user: 'User',
  contributor: 'Contributor',
  moderator: 'Moderator',
  admin: 'Admin',
  superadmin: 'Super Admin',
};

export default function Admin() {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperadmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [authLoading, isAdmin, navigate]);

  // Fetch all users with their roles
  useEffect(() => {
    const fetchUsers = async () => {
      if (!isAdmin) return;

      try {
        // Fetch profiles
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;

        // Fetch all roles
        const { data: allRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id, role');

        if (rolesError) throw rolesError;

        // Combine profiles with roles
        const usersWithRoles: UserWithRoles[] = (profiles || []).map((profile) => ({
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          is_active: profile.is_active,
          created_at: profile.created_at,
          last_login_at: profile.last_login_at,
          roles: (allRoles || [])
            .filter((r) => r.user_id === profile.id)
            .map((r) => r.role as AppRole),
        }));

        setUsers(usersWithRoles);
      } catch (error) {
        console.error('Error fetching users:', error);
        toast({
          title: 'Error',
          description: 'Failed to load users',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [isAdmin, toast]);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    if (!isSuperadmin) {
      toast({
        title: 'Permission denied',
        description: 'Only superadmins can modify roles',
        variant: 'destructive',
      });
      return;
    }

    // Prevent self-demotion
    if (userId === user?.id && newRole !== 'superadmin') {
      toast({
        title: 'Cannot modify own role',
        description: 'You cannot demote yourself',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingUserId(userId);

    try {
      // Remove all existing roles for this user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Add the new role (and user role if not 'user')
      const rolesToInsert = [{ user_id: userId, role: 'user' as AppRole, granted_by: user?.id }];
      
      if (newRole !== 'user') {
        rolesToInsert.push({ user_id: userId, role: newRole, granted_by: user?.id });
      }

      const { error: insertError } = await supabase
        .from('user_roles')
        .insert(rolesToInsert);

      if (insertError) throw insertError;

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, roles: newRole === 'user' ? ['user'] : ['user', newRole] }
            : u
        )
      );

      toast({
        title: 'Role updated',
        description: `User role changed to ${ROLE_LABELS[newRole]}`,
      });
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update role',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const getHighestRole = (roles: AppRole[]): AppRole => {
    const hierarchy: AppRole[] = ['superadmin', 'admin', 'moderator', 'contributor', 'user'];
    for (const role of hierarchy) {
      if (roles.includes(role)) return role;
    }
    return 'user';
  };

  const getInitials = (name: string | null, email: string): string => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const stats = {
    total: users.length,
    superadmins: users.filter((u) => u.roles.includes('superadmin')).length,
    admins: users.filter((u) => u.roles.includes('admin')).length,
    active: users.filter((u) => u.is_active).length,
  };

  return (
    <main id="main-content" className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage users, roles, and system settings
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <Crown className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.superadmins}</p>
                <p className="text-sm text-muted-foreground">Super Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-500/10 rounded-lg">
                <UserCog className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.admins}</p>
                <p className="text-sm text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Settings className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                View and manage user accounts and their roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    {isSuperadmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((userItem) => {
                    const highestRole = getHighestRole(userItem.roles);
                    const isCurrentUser = userItem.id === user?.id;

                    return (
                      <TableRow key={userItem.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={userItem.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {getInitials(userItem.full_name, userItem.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {userItem.display_name || userItem.full_name || 'Anonymous'}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {userItem.email}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${ROLE_COLORS[highestRole]} text-white`}>
                            {ROLE_LABELS[highestRole]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={userItem.is_active ? 'default' : 'secondary'}>
                            {userItem.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(userItem.created_at).toLocaleDateString()}
                        </TableCell>
                        {isSuperadmin && (
                          <TableCell>
                            <Select
                              value={highestRole}
                              onValueChange={(value) =>
                                handleRoleChange(userItem.id, value as AppRole)
                              }
                              disabled={updatingUserId === userItem.id || isCurrentUser}
                            >
                              <SelectTrigger className="w-32">
                                {updatingUserId === userItem.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <SelectValue />
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="contributor">Contributor</SelectItem>
                                <SelectItem value="moderator">Moderator</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="superadmin">Super Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
              <CardDescription>
                Configure system-wide settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                System settings coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
