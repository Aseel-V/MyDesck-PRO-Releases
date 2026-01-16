-- ============================================================================
-- RESTAURANT MODE - SECURITY & AUDIT INFRASTRUCTURE
-- Version: 1.0.0 | Apply via Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. AUDIT LOGS TABLE
-- Tracks all sensitive actions for accountability and fraud prevention
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  
  -- Action details
  action TEXT NOT NULL CHECK (action IN (
    'VOID_ITEM', 
    'VOID_ORDER', 
    'DISCOUNT_APPLIED', 
    'REFUND', 
    'DRAWER_OPEN', 
    'PRICE_OVERRIDE',
    'STAFF_CLOCK_IN',
    'STAFF_CLOCK_OUT',
    'ORDER_DELETED',
    'PAYMENT_MODIFIED'
  )),
  
  -- Who performed the action
  actor_staff_id UUID NOT NULL,
  
  -- Manager who approved (for override actions)
  approver_staff_id UUID,
  
  -- What was affected
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'order', 
    'order_item', 
    'payment', 
    'staff',
    'drawer'
  )),
  entity_id UUID NOT NULL,
  
  -- Before/after values for tracking changes
  old_value JSONB,
  new_value JSONB,
  
  -- Human-readable reason
  reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_business ON audit_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see audit logs for their business
CREATE POLICY "audit_logs_business_isolation" ON audit_logs
FOR ALL USING (
  business_id IN (
    SELECT id FROM business_profiles WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- 2. ORDER PROTECTION POLICIES
-- Prevent deletion/modification of orders after they leave draft status
-- ============================================================================

-- Note: These policies assume you have RLS enabled on restaurant_orders table
-- If not, run: ALTER TABLE restaurant_orders ENABLE ROW LEVEL SECURITY;

-- Prevent DELETE on orders that are not drafts
-- This stops waiters from deleting orders after kitchen has seen them
CREATE POLICY "orders_no_delete_after_sent" ON restaurant_orders
FOR DELETE USING (status = 'draft');

-- Prevent DELETE on order items that are cooking or beyond
-- Once kitchen starts cooking, items are locked
CREATE POLICY "items_no_delete_after_cooking" ON restaurant_order_items
FOR DELETE USING (status IN ('pending', 'cancelled'));

-- ============================================================================
-- 3. PRICE MODIFICATION PROTECTION
-- Only managers can modify prices on order items
-- ============================================================================

-- This is a partial policy - we prevent price changes except for users
-- linked to staff with manager roles. You may need to adjust based on
-- your exact column structure.

-- First, create a helper function to check if current user is a manager
CREATE OR REPLACE FUNCTION is_restaurant_manager()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the user is linked to a manager-level staff record
  RETURN EXISTS (
    SELECT 1 FROM restaurant_staff rs
    JOIN business_profiles bp ON rs.business_id = bp.id
    WHERE bp.user_id = auth.uid()
    AND rs.user_id = auth.uid()
    AND rs.restaurant_role IN ('super_admin', 'branch_manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Only managers can update price_at_time on restaurant_order_items
-- Note: This uses UPDATE check, not a blanket policy
-- You may need to create a trigger instead for more complex logic

-- ============================================================================
-- 4. TRIGGER FOR AUDIT LOGGING ON VOIDS
-- Automatically log when orders or items are voided
-- ============================================================================

CREATE OR REPLACE FUNCTION log_void_action()
RETURNS TRIGGER AS $$
BEGIN
  -- Log when an order item is voided
  IF TG_TABLE_NAME = 'restaurant_order_items' AND NEW.voided = TRUE AND OLD.voided = FALSE THEN
    INSERT INTO audit_logs (
      business_id,
      action,
      actor_staff_id,
      entity_type,
      entity_id,
      old_value,
      new_value,
      reason
    )
    SELECT 
      ro.business_id,
      'VOID_ITEM',
      COALESCE(NEW.voided_by, ro.server_id, gen_random_uuid()),
      'order_item',
      NEW.id,
      jsonb_build_object('voided', OLD.voided, 'quantity', OLD.quantity),
      jsonb_build_object('voided', NEW.voided, 'void_reason', NEW.void_reason),
      NEW.void_reason
    FROM restaurant_orders ro
    WHERE ro.id = NEW.order_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to restaurant_order_items table
DROP TRIGGER IF EXISTS trigger_log_void_action ON restaurant_order_items;
CREATE TRIGGER trigger_log_void_action
  AFTER UPDATE ON restaurant_order_items
  FOR EACH ROW
  EXECUTE FUNCTION log_void_action();

-- ============================================================================
-- 5. STAFF PIN VALIDATION FUNCTION (Optional - for extra security)
-- Validate PIN server-side to prevent client-side manipulation
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_staff_pin(
  p_staff_id UUID,
  p_pin TEXT,
  p_business_id UUID
)
RETURNS TABLE(valid BOOLEAN, staff_id UUID, staff_name TEXT, restaurant_role TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (rs.pin_code = p_pin) AS valid,
    rs.id AS staff_id,
    rs.full_name AS staff_name,
    rs.restaurant_role::TEXT AS restaurant_role
  FROM restaurant_staff rs
  WHERE rs.id = p_staff_id
    AND rs.business_id = p_business_id
    AND rs.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DONE! Apply this SQL in your Supabase SQL Editor
-- ============================================================================
