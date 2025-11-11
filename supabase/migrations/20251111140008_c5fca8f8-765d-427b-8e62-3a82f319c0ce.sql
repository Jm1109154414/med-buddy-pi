-- Create custom types
CREATE TYPE public.dose_status AS ENUM ('taken', 'late', 'missed', 'skipped');
CREATE TYPE public.dose_source AS ENUM ('auto', 'manual');
CREATE TYPE public.report_type AS ENUM ('weekly', 'monthly');
CREATE TYPE public.command_status AS ENUM ('pending', 'ack', 'done', 'error', 'expired');

-- Devices table
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  serial text UNIQUE NOT NULL,
  secret text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Compartments table (5 per device)
CREATE TABLE public.compartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  idx int2 NOT NULL CHECK (idx BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT 'Sin título',
  expected_pill_weight_g float8,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (device_id, idx)
);

-- Schedules table
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compartment_id uuid NOT NULL REFERENCES public.compartments(id) ON DELETE CASCADE,
  time_of_day text NOT NULL,
  days_of_week int2 NOT NULL DEFAULT 127,
  window_minutes int2 NOT NULL DEFAULT 10,
  enable_led boolean NOT NULL DEFAULT true,
  enable_buzzer boolean NOT NULL DEFAULT true
);

-- Dose events table
CREATE TABLE public.dose_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  compartment_id uuid REFERENCES public.compartments(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  status public.dose_status NOT NULL,
  actual_at timestamptz,
  delta_weight_g float8,
  source public.dose_source NOT NULL DEFAULT 'auto',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dose_events_device_scheduled ON public.dose_events (device_id, scheduled_at);

-- Weight readings table
CREATE TABLE public.weight_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL,
  weight_g float8 NOT NULL,
  raw jsonb
);

CREATE INDEX idx_weight_readings_device_measured ON public.weight_readings (device_id, measured_at);

-- Reports table
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  range_start date NOT NULL,
  range_end date NOT NULL,
  type public.report_type NOT NULL,
  file_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Push subscriptions table
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_info jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz,
  UNIQUE (user_id, endpoint)
);

-- Commands table (for snooze, reboot, etc.)
CREATE TABLE public.commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  status public.command_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;

-- RLS Policies for devices
CREATE POLICY "Users can manage their own devices"
  ON public.devices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for compartments
CREATE POLICY "Users can manage compartments of their devices"
  ON public.compartments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.devices d 
    WHERE d.id = device_id AND d.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.devices d 
    WHERE d.id = device_id AND d.user_id = auth.uid()
  ));

-- RLS Policies for schedules
CREATE POLICY "Users can manage schedules of their compartments"
  ON public.schedules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.compartments c 
    JOIN public.devices d ON d.id = c.device_id 
    WHERE c.id = compartment_id AND d.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.compartments c 
    JOIN public.devices d ON d.id = c.device_id 
    WHERE c.id = compartment_id AND d.user_id = auth.uid()
  ));

-- RLS Policies for dose_events
CREATE POLICY "Users can read their dose events"
  ON public.dose_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.devices d 
    WHERE d.id = device_id AND d.user_id = auth.uid()
  ));

CREATE POLICY "Devices can insert dose events"
  ON public.dose_events FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.devices d WHERE d.id = device_id
  ));

-- RLS Policies for weight_readings
CREATE POLICY "Users can read their weight readings"
  ON public.weight_readings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.devices d 
    WHERE d.id = device_id AND d.user_id = auth.uid()
  ));

CREATE POLICY "Devices can insert weight readings"
  ON public.weight_readings FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.devices d WHERE d.id = device_id
  ));

-- RLS Policies for reports
CREATE POLICY "Users can manage their own reports"
  ON public.reports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for push_subscriptions
CREATE POLICY "Users can manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for commands
CREATE POLICY "Users can manage commands for their devices"
  ON public.commands FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.devices d 
    WHERE d.id = device_id AND d.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.devices d 
    WHERE d.id = device_id AND d.user_id = auth.uid()
  ));

-- Enable realtime for dose_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.dose_events;