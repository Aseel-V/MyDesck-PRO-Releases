-- ============================================================================
-- SECURITY AUDIT LOGGING SCHEMA
-- Purpose: Immutable log of all critical security overrides (Allergies, Voids)
-- ============================================================================

CREATE TABLE IF NOT EXISTS restaurant_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    business_id UUID REFERENCES auth.users(id),
    staff_id UUID REFERENCES restaurant_staff(id),
    
    event_type TEXT NOT NULL, -- 'ALLERGY_OVERRIDE', 'MANAGER_VOID', 'DISCOUNT_APPLIED'
    details JSONB NOT NULL,   -- Stores item_id, reason, auth_method, original_value, new_value
    
    -- Immutable by design: No UPDATE policy
    severity TEXT CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL'))
);

-- RLS POLICIES
ALTER TABLE restaurant_audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Insert: Allowed by authenticated staff
CREATE POLICY "Staff can insert audit logs" 
ON restaurant_audit_logs FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = business_id);

-- 2. Select: Managers/Owners only (Mock role check)
CREATE POLICY "Owners can view audit logs" 
ON restaurant_audit_logs FOR SELECT 
TO authenticated 
USING (auth.uid() = business_id);

-- 3. Update/Delete: DENIED (Immutable)
-- No policies created for UPDATE or DELETE implies DENY ALL.

-- INDEXES
CREATE INDEX idx_audit_logs_business ON restaurant_audit_logs(business_id);
CREATE INDEX idx_audit_logs_type ON restaurant_audit_logs(event_type);
CREATE INDEX idx_audit_logs_created ON restaurant_audit_logs(created_at DESC);
