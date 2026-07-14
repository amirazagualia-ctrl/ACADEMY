-- ============================================================
-- EduManage - Plateforme d'éducation complète (Tunisie)
-- Schéma Supabase - À exécuter dans le SQL Editor
-- ============================================================

-- Élèves
CREATE TABLE IF NOT EXISTS students (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date DATE,
  gender TEXT DEFAULT 'M',
  photo_url TEXT,
  cycle TEXT NOT NULL DEFAULT 'primaire', -- primaire | base | secondaire
  level TEXT NOT NULL,                    -- 1AP..6AP, 7AB..9AB, 1AS..4AS
  class_name TEXT,
  parent_name TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'actif',            -- actif | inactif
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enseignants
CREATE TABLE IF NOT EXISTS teachers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subject TEXT,
  cycles TEXT DEFAULT 'primaire',
  status TEXT DEFAULT 'actif',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
  capacity INT DEFAULT 30,
  room TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Matières
CREATE TABLE IF NOT EXISTS subjects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  coefficient NUMERIC DEFAULT 1,
  cycle TEXT DEFAULT 'primaire',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notes
CREATE TABLE IF NOT EXISTS grades (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,
  trimester INT DEFAULT 1,               -- 1 | 2 | 3
  score NUMERIC NOT NULL,
  max_score NUMERIC DEFAULT 20,
  exam_type TEXT DEFAULT 'controle',     -- controle | synthese | oral
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Présence
CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present', -- present | absent | retard | excuse
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, date)
);

-- Frais
CREATE TABLE IF NOT EXISTS fees (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Frais d''inscription',
  amount NUMERIC NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'pending',          -- paid | pending | overdue
  paid_date DATE,
  method TEXT,                            -- especes | cheque | virement
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cours (fichiers PDF, Excel, Docx...)
CREATE TABLE IF NOT EXISTS courses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  cycle TEXT DEFAULT 'primaire',
  level TEXT,
  subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cours interactifs (quiz)
CREATE TABLE IF NOT EXISTS interactive_courses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  cycle TEXT DEFAULT 'primaire',
  level TEXT,
  subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,
  questions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Événements (calendrier)
CREATE TABLE IF NOT EXISTS events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  end_date DATE,
  type TEXT DEFAULT 'general',            -- general | examen | vacances | reunion | activite
  level TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                     -- absence | retard | frais | note | engagement | info
  title TEXT,
  message TEXT NOT NULL,
  recipient TEXT,                         -- email ou téléphone
  sent_via TEXT DEFAULT 'app',            -- app | email | sms
  status TEXT DEFAULT 'sent',             -- sent | failed | logged
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Comptes utilisateurs
CREATE TABLE IF NOT EXISTS user_accounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'parent',    -- admin | teacher | parent | student
  status TEXT DEFAULT 'active',           -- active | inactive
  linked_student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
  linked_student_ids JSONB DEFAULT '[]',
  phone TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Demandes d'inscription
CREATE TABLE IF NOT EXISTS registrations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date DATE,
  gender TEXT DEFAULT 'M',
  cycle TEXT DEFAULT 'primaire',
  level TEXT,
  parent_name TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  address TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',          -- pending | approved | rejected
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Paramètres (école, notifications SMS/email)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_students_level ON students(level);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_fees_student ON fees(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);

-- ============================================================
-- DONNÉES INITIALES
-- ============================================================

-- Compte administrateur par défaut : admin@edumanage.tn / admin123
INSERT INTO user_accounts (name, email, password_hash, role, status)
VALUES ('Administrateur', 'admin@edumanage.tn', 'f8e89d46e84e48fd8a1cfb98a4586db04e40a7323470ad02c9b2c4c2d61c94b8', 'admin', 'active')
ON CONFLICT (email) DO NOTHING;

-- Matières par cycle
INSERT INTO subjects (name, coefficient, cycle) VALUES
 ('Arabe', 2, 'primaire'), ('Français', 2, 'primaire'), ('Mathématiques', 2, 'primaire'),
 ('Éveil scientifique', 1, 'primaire'), ('Éducation islamique', 1, 'primaire'), ('Éducation artistique', 1, 'primaire'),
 ('Arabe', 2, 'base'), ('Français', 2, 'base'), ('Anglais', 1, 'base'), ('Mathématiques', 2, 'base'),
 ('Sciences de la vie et de la terre', 1, 'base'), ('Physique', 1, 'base'), ('Histoire-Géographie', 1, 'base'), ('Informatique', 1, 'base'),
 ('Arabe', 1, 'secondaire'), ('Français', 2, 'secondaire'), ('Anglais', 2, 'secondaire'), ('Mathématiques', 3, 'secondaire'),
 ('Physique', 3, 'secondaire'), ('Sciences naturelles', 2, 'secondaire'), ('Philosophie', 1, 'secondaire'), ('Informatique', 1, 'secondaire');

-- Enseignants d'exemple
INSERT INTO teachers (first_name, last_name, email, phone, subject, cycles) VALUES
 ('Ahmed', 'Ben Salah', 'ahmed.bensalah@edumanage.tn', '+21620111222', 'Mathématiques', 'base'),
 ('Fatma', 'Trabelsi', 'fatma.trabelsi@edumanage.tn', '+21620333444', 'Français', 'primaire'),
 ('Mohamed', 'Gharbi', 'mohamed.gharbi@edumanage.tn', '+21620555666', 'Physique', 'secondaire');

-- Classes d'exemple
INSERT INTO classes (name, level, capacity, room) VALUES
 ('1AP-A', '1AP', 28, 'Salle 1'), ('6AP-A', '6AP', 30, 'Salle 6'),
 ('7AB-A', '7AB', 32, 'Salle 10'), ('9AB-A', '9AB', 30, 'Salle 12'),
 ('1AS-A', '1AS', 30, 'Salle 20'), ('4AS-A', '4AS', 25, 'Salle 24');

-- Élèves d'exemple
INSERT INTO students (first_name, last_name, birth_date, gender, cycle, level, class_name, parent_name, parent_email, parent_phone, address) VALUES
 ('Youssef', 'Ben Ali', '2018-03-12', 'M', 'primaire', '1AP', '1AP-A', 'Karim Ben Ali', 'karim.benali@gmail.com', '+21622111111', 'Tunis'),
 ('Amira', 'Jlassi', '2013-07-25', 'F', 'primaire', '6AP', '6AP-A', 'Sami Jlassi', 'sami.jlassi@gmail.com', '+21622222222', 'Ariana'),
 ('Omar', 'Mansouri', '2012-01-15', 'M', 'base', '7AB', '7AB-A', 'Nadia Mansouri', 'nadia.mansouri@gmail.com', '+21622333333', 'Sousse'),
 ('Salma', 'Khelifi', '2010-11-02', 'F', 'base', '9AB', '9AB-A', 'Hichem Khelifi', 'hichem.khelifi@gmail.com', '+21622444444', 'Sfax'),
 ('Mehdi', 'Bouzid', '2009-05-30', 'M', 'secondaire', '1AS', '1AS-A', 'Leila Bouzid', 'leila.bouzid@gmail.com', '+21622555555', 'Tunis'),
 ('Ines', 'Chaabane', '2006-09-18', 'F', 'secondaire', '4AS', '4AS-A', 'Riadh Chaabane', 'riadh.chaabane@gmail.com', '+21622666666', 'Monastir');

-- Frais d'exemple
INSERT INTO fees (student_id, label, amount, due_date, status) VALUES
 (1, 'Frais d''inscription 2026-2027', 350, '2026-09-15', 'pending'),
 (2, 'Frais d''inscription 2026-2027', 350, '2026-09-15', 'paid'),
 (3, 'Frais d''inscription 2026-2027', 420, '2026-06-01', 'pending'),
 (4, 'Frais d''inscription 2026-2027', 420, '2026-09-15', 'pending'),
 (5, 'Frais d''inscription 2026-2027', 500, '2026-09-15', 'paid'),
 (6, 'Frais d''inscription 2026-2027', 500, '2026-06-10', 'pending');

-- Événements d'exemple
INSERT INTO events (title, description, date, end_date, type) VALUES
 ('Rentrée scolaire', 'Rentrée 2026-2027', '2026-09-15', NULL, 'general'),
 ('Examens Trimestre 1', 'Examens de synthèse', '2026-12-07', '2026-12-12', 'examen'),
 ('Vacances d''hiver', NULL, '2026-12-20', '2027-01-03', 'vacances'),
 ('Réunion parents-enseignants', 'Réunion trimestrielle', '2026-10-24', NULL, 'reunion');

-- Paramètres par défaut
INSERT INTO settings (key, value) VALUES
 ('school', '{"name":"EduManage - École Tunisienne","address":"Tunis, Tunisie","phone":"+216 71 000 000","email":"contact@edumanage.tn"}'),
 ('notifications', '{"email_absence":true,"email_frais":true,"email_note":true,"sms_absence":false,"sms_frais":false,"sms_note":false}')
ON CONFLICT (key) DO NOTHING;
