
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { checkToolAccess, MembershipTier } from "../_shared/rbacPolicy.ts";

Deno.test("RBAC Policy - User Tier", () => {
    // User should access basic tools
    assertEquals(checkToolAccess('browse_web', MembershipTier.USER).allowed, true);
    assertEquals(checkToolAccess('analyze_attachment', MembershipTier.USER).allowed, true);

    // User should NOT access restricted tools
    assertEquals(checkToolAccess('delete_task', MembershipTier.USER).allowed, false);
    assertEquals(checkToolAccess('invoke_edge_function', MembershipTier.USER).allowed, false);
});

Deno.test("RBAC Policy - Contributor Tier", () => {
    // Contributor should access user tools + contributor tools
    assertEquals(checkToolAccess('browse_web', MembershipTier.CONTRIBUTOR).allowed, true);
    assertEquals(checkToolAccess('get_mining_stats', MembershipTier.CONTRIBUTOR).allowed, true);

    // Contributor should NOT access admin tools
    assertEquals(checkToolAccess('delete_task', MembershipTier.CONTRIBUTOR).allowed, false);
});

Deno.test("RBAC Policy - Admin Tier", () => {
    // Admin should access almost everything
    assertEquals(checkToolAccess('delete_task', MembershipTier.ADMIN).allowed, true);
    assertEquals(checkToolAccess('get_agent_status', MembershipTier.ADMIN).allowed, true);

    // Admin might not access SUPER_ADMIN tools
    assertEquals(checkToolAccess('invoke_edge_function', MembershipTier.ADMIN).allowed, false);
});

Deno.test("RBAC Policy - Super Admin Tier", () => {
    // Super Admin should access everything
    assertEquals(checkToolAccess('invoke_edge_function', MembershipTier.SUPER_ADMIN).allowed, true);
});

Deno.test("RBAC Policy - Default Behavior", () => {
    // Unknown tool -> Default to USER (Allowed)
    assertEquals(checkToolAccess('unknown_tool', MembershipTier.USER).allowed, true);

    // Invalid user tier -> Default to USER
    assertEquals(checkToolAccess('delete_task', 'invalid_tier' as any).allowed, false);
});
