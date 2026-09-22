-- Replace single users.manager_id with a many-to-many employee_managers join table.
CREATE TABLE IF NOT EXISTS employee_managers (
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, manager_id)
);
CREATE INDEX IF NOT EXISTS employee_managers_manager_idx ON employee_managers(manager_id);
CREATE INDEX IF NOT EXISTS employee_managers_employee_idx ON employee_managers(employee_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'manager_id'
  ) THEN
    INSERT INTO employee_managers (employee_id, manager_id)
    SELECT id, manager_id FROM users WHERE manager_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE users DROP COLUMN manager_id;
  END IF;
END $$;
