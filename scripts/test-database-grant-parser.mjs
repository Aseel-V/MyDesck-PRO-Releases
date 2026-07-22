import assert from 'node:assert/strict';
import { hasEffectiveRoutineExecuteGrant } from './sql-routine-grants.mjs';

const target = {
  schema: 'public',
  functionName: 'save_trip_transaction',
  argumentTypes: ['jsonb', 'jsonb', 'uuid'],
  grantee: 'authenticated',
};
const chain = (...statements) => statements.map((sql, index) => ({ name: `${index}.sql`, sql }));
const accepts = (sql) => hasEffectiveRoutineExecuteGrant(chain(sql), target);

assert.equal(accepts('GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;'), true);
assert.equal(accepts(`
  GRANT EXECUTE
  ON FUNCTION public.save_trip_transaction(
    jsonb,
    jsonb,
    uuid
  )
  TO authenticated;
`), true);
assert.equal(accepts('GRANT/* token separator */EXECUTE ON FUNCTION public.save_trip_transaction(jsonb,jsonb,uuid) TO authenticated;'), true);
assert.equal(accepts('GRANT EXECUTE ON FUNCTION\npublic.save_trip_transaction(jsonb,jsonb,uuid)\nTO authenticated, service_role;'), true);
assert.equal(accepts('grant execute on function public.save_trip_transaction(jsonb, jsonb, uuid) to authenticated;'), true);
assert.equal(accepts(`
  -- authenticated in an ordinary comment is ignored
  /* block comment before the statement */
  GRANT /* privilege */ EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid)
  TO /* grantee */ authenticated;
`), true);
assert.equal(accepts(`
  CREATE FUNCTION public.unrelated() RETURNS void LANGUAGE plpgsql AS $$
  BEGIN
    PERFORM ';'; -- semicolons inside a dollar-quoted body are not statements
  END
  $$;
  GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;
`), true);

assert.equal(accepts('GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO service_role;'), false);
assert.equal(accepts('GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO anon;'), false);
assert.equal(accepts('GRANT EXECUTE ON FUNCTION public.other_function(jsonb, jsonb, uuid) TO authenticated;'), false);
assert.equal(accepts('GRANT EXECUTE ON FUNCTION private.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;'), false);
assert.equal(accepts('GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, uuid) TO authenticated;'), false);
assert.equal(accepts('GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, text, uuid) TO authenticated;'), false);
assert.equal(accepts('GRANT SELECT ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;'), false);
assert.equal(accepts('REVOKE EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) FROM authenticated;'), false);
assert.equal(accepts('-- TO authenticated\nGRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO service_role;'), false);
assert.equal(accepts(`
  GRANT EXECUTE ON FUNCTION public.other_function(jsonb, jsonb, uuid) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO service_role;
`), false);
assert.equal(accepts('CREATE OR REPLACE FUNCTION public.save_trip_transaction(p_trip_data jsonb, p_payment_plan jsonb, p_client_request_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;'), false);

assert.equal(hasEffectiveRoutineExecuteGrant(chain(
  'GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;',
  '-- a later migration need not repeat the grant',
), target), true);
assert.equal(hasEffectiveRoutineExecuteGrant(chain(
  'GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;',
  'REVOKE EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) FROM authenticated;',
), target), false);
assert.equal(hasEffectiveRoutineExecuteGrant(chain(
  'GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;',
  'REVOKE ALL PRIVILEGES ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) FROM authenticated;',
  'GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;',
), target), true);

console.log('[database-grant-parser] Positive, negative, and migration-chain grant tests passed.');
