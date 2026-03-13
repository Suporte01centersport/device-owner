--
-- PostgreSQL database dump
--

\restrict ghowFSTXZMwetSP9wpJuKAGvzQAqxR0Qds9jyayx4ERiUq43meFmfwA0idek5Ud

-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: cleanup_old_group_alerts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_group_alerts() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM group_alert_history
    WHERE created_at < NOW() - INTERVAL '60 days';
END;
$$;


--
-- Name: update_group_available_apps_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_group_available_apps_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_passwords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_passwords (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    password_hash character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(100) NOT NULL,
    role character varying(20) DEFAULT 'admin'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone
);


--
-- Name: admin_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_users_id_seq OWNED BY public.admin_users.id;


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id integer NOT NULL,
    type character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'warning'::character varying,
    device_id character varying(255),
    device_name character varying(255),
    message text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    is_resolved boolean DEFAULT false,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alerts_id_seq OWNED BY public.alerts.id;


--
-- Name: app_access_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_access_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    device_id character varying(255) NOT NULL,
    package_name character varying(255) NOT NULL,
    app_name character varying(255) NOT NULL,
    access_date date NOT NULL,
    first_access_time timestamp with time zone NOT NULL,
    last_access_time timestamp with time zone NOT NULL,
    access_count integer DEFAULT 1,
    total_duration_ms bigint DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_allowed boolean DEFAULT true
);


--
-- Name: app_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_policies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    group_id uuid,
    package_name character varying(255) NOT NULL,
    app_name character varying(255) NOT NULL,
    policy_type character varying(20) DEFAULT 'allow'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: applocker_allowed_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applocker_allowed_programs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    path text,
    publisher character varying(255),
    product_name character varying(255),
    hash character varying(255),
    rule_type character varying(50) DEFAULT 'path'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE applocker_allowed_programs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.applocker_allowed_programs IS 'Programas permitidos pelo AppLocker para cada computador';


--
-- Name: COLUMN applocker_allowed_programs.rule_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applocker_allowed_programs.rule_type IS 'Tipo de regra: path (caminho), publisher (editor), hash (hash do arquivo)';


--
-- Name: applocker_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applocker_config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid NOT NULL,
    enabled boolean DEFAULT false,
    mode character varying(50) DEFAULT 'enforce'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE applocker_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.applocker_config IS 'Configuração do AppLocker para cada computador';


--
-- Name: COLUMN applocker_config.mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applocker_config.mode IS 'Modo de imposição: enforce (aplicar) ou audit (apenas auditar)';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    admin_username character varying(255) NOT NULL,
    action character varying(255) NOT NULL,
    target_resource character varying(255),
    details text,
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: computer_group_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_group_memberships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    group_id uuid,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now()
);


--
-- Name: computer_installed_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_installed_programs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    name character varying(255) NOT NULL,
    version character varying(100),
    publisher character varying(255),
    install_date timestamp with time zone,
    install_location text,
    size bigint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: computer_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_locations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    latitude numeric(10,8),
    longitude numeric(11,8),
    accuracy numeric(8,2),
    provider character varying(50),
    address text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: computer_monitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_monitors (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    manufacturer character varying(255),
    model character varying(255),
    serial_number character varying(255),
    week_of_manufacture character varying(10),
    year_of_manufacture character varying(10),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: computer_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_policies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    group_id uuid,
    user_id uuid,
    blocked_sites text[] DEFAULT '{}'::text[],
    inactivity_time_minutes integer,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE computer_policies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.computer_policies IS 'Armazena políticas de computadores (bloqueio de sites e tempo de inatividade) por grupo e usuário';


--
-- Name: COLUMN computer_policies.group_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.computer_policies.group_id IS 'Grupo ao qual a política se aplica';


--
-- Name: COLUMN computer_policies.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.computer_policies.user_id IS 'Usuário específico (NULL = política do grupo inteiro)';


--
-- Name: COLUMN computer_policies.blocked_sites; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.computer_policies.blocked_sites IS 'Array de sites bloqueados (ex: ["facebook.com", "twitter.com"])';


--
-- Name: COLUMN computer_policies.inactivity_time_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.computer_policies.inactivity_time_minutes IS 'Tempo de inatividade em minutos antes de suspender (NULL = desabilitado)';


--
-- Name: computer_printers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_printers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    name character varying(255) NOT NULL,
    port character varying(255),
    is_default boolean DEFAULT false,
    is_network boolean DEFAULT false,
    is_shared boolean DEFAULT false,
    status character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: computer_restrictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_restrictions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    camera_disabled boolean DEFAULT false,
    screen_capture_disabled boolean DEFAULT false,
    bluetooth_disabled boolean DEFAULT false,
    usb_data_transfer_disabled boolean DEFAULT false,
    wifi_disabled boolean DEFAULT false,
    factory_reset_disabled boolean DEFAULT true,
    safe_boot_disabled boolean DEFAULT true,
    status_bar_disabled boolean DEFAULT false,
    usb_devices_blocked boolean DEFAULT false,
    cd_rom_disabled boolean DEFAULT false,
    printer_install_disabled boolean DEFAULT false,
    remote_desktop_disabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: computer_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_status_history (
    id integer NOT NULL,
    computer_id character varying(255) NOT NULL,
    status_date date NOT NULL,
    status character varying(20) NOT NULL,
    online_count integer DEFAULT 0,
    last_online_time timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: computer_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.computer_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: computer_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.computer_status_history_id_seq OWNED BY public.computer_status_history.id;


--
-- Name: computer_storage_drives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_storage_drives (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    drive character varying(10) NOT NULL,
    label character varying(255),
    file_system character varying(50),
    total bigint DEFAULT 0,
    used bigint DEFAULT 0,
    free bigint DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: computers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    computer_id character varying(255) NOT NULL,
    name character varying(255),
    hostname character varying(255),
    domain character varying(255),
    os_type character varying(50) DEFAULT 'Windows'::character varying NOT NULL,
    os_version character varying(100),
    os_build character varying(50),
    architecture character varying(20) DEFAULT 'x64'::character varying,
    cpu_model character varying(255),
    cpu_cores integer,
    cpu_threads integer,
    memory_total bigint DEFAULT 0,
    memory_used bigint DEFAULT 0,
    storage_total bigint DEFAULT 0,
    storage_used bigint DEFAULT 0,
    ip_address inet,
    mac_address character varying(17),
    network_type character varying(50),
    wifi_ssid character varying(255),
    is_wifi_enabled boolean DEFAULT false,
    is_bluetooth_enabled boolean DEFAULT false,
    agent_version character varying(50),
    agent_installed_at timestamp with time zone,
    last_heartbeat timestamp with time zone,
    logged_in_user character varying(255),
    assigned_device_user_id uuid,
    compliance_status character varying(20) DEFAULT 'unknown'::character varying,
    antivirus_installed boolean DEFAULT false,
    antivirus_enabled boolean DEFAULT false,
    antivirus_name character varying(255),
    firewall_enabled boolean DEFAULT false,
    encryption_enabled boolean DEFAULT false,
    latitude numeric(10,8),
    longitude numeric(11,8),
    location_accuracy numeric(8,2),
    last_location_update timestamp with time zone,
    status character varying(20) DEFAULT 'offline'::character varying,
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    location_address text,
    location_source character varying(50),
    processor_arch character varying(50),
    memory_slots jsonb DEFAULT '[]'::jsonb,
    os_description character varying(500),
    os_edition character varying(255),
    manufacturer character varying(255),
    model character varying(255),
    serial character varying(255),
    install_date timestamp with time zone,
    last_boot_up_time timestamp with time zone
);


--
-- Name: COLUMN computers.location_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.computers.location_address IS 'Endereço formatado da localização (cidade, região, país)';


--
-- Name: COLUMN computers.location_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.computers.location_source IS 'Fonte da localização (ip-api.com, windows, gps, etc.)';


--
-- Name: config_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_backups (
    id integer NOT NULL,
    backup_type character varying(50) NOT NULL,
    data jsonb NOT NULL,
    description character varying(500),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: config_backups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.config_backups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: config_backups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.config_backups_id_seq OWNED BY public.config_backups.id;


--
-- Name: deleted_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deleted_devices (
    device_id character varying(255) NOT NULL,
    deleted_at timestamp with time zone DEFAULT now()
);


--
-- Name: device_group_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_group_memberships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    device_id uuid,
    group_id uuid,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    computer_id uuid,
    CONSTRAINT check_device_or_computer CHECK (((device_id IS NOT NULL) OR (computer_id IS NOT NULL)))
);


--
-- Name: device_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    name character varying(255) NOT NULL,
    description text,
    color character varying(7) DEFAULT '#3B82F6'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    allowed_networks text[] DEFAULT '{}'::text[],
    allowed_location jsonb,
    allowed_computer_location jsonb,
    dlp_config jsonb,
    blocked_removable_storage boolean DEFAULT false,
    blocked_control_panel boolean DEFAULT false,
    disabled_smartscreen boolean DEFAULT false,
    blocked_cmd_powershell boolean DEFAULT false,
    blocked_registry_editor boolean DEFAULT false,
    allowed_locations jsonb
);


--
-- Name: device_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_locations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    device_id uuid,
    latitude numeric(10,8),
    longitude numeric(11,8),
    accuracy numeric(8,2),
    provider character varying(50),
    address text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: device_restrictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_restrictions (
    id integer NOT NULL,
    device_id character varying(255) NOT NULL,
    restrictions jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_global boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: device_restrictions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.device_restrictions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: device_restrictions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.device_restrictions_id_seq OWNED BY public.device_restrictions.id;


--
-- Name: device_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_status_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    device_id character varying(255) NOT NULL,
    status_date date NOT NULL,
    status character varying(20) NOT NULL,
    online_count integer DEFAULT 0,
    last_online_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: device_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    user_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    cpf character varying(14) NOT NULL,
    email character varying(255),
    phone character varying(20),
    department character varying(100),
    "position" character varying(100),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    birth_year integer,
    device_model character varying(255),
    device_serial_number character varying(255),
    birth_date date
);


--
-- Name: TABLE device_users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.device_users IS 'Usuários finais vinculados aos dispositivos (funcionários, alunos, etc.)';


--
-- Name: COLUMN device_users.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.device_users.user_id IS 'ID customizado do usuário (pode ser matrícula, código de funcionário, etc.)';


--
-- Name: COLUMN device_users.cpf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.device_users.cpf IS 'CPF do usuário brasileiro (formato: 000.000.000-00)';


--
-- Name: COLUMN device_users.birth_year; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.device_users.birth_year IS 'Ano de nascimento do usuário';


--
-- Name: COLUMN device_users.device_model; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.device_users.device_model IS 'Modelo do celular do usuário';


--
-- Name: COLUMN device_users.device_serial_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.device_users.device_serial_number IS 'Número de série do celular';


--
-- Name: COLUMN device_users.birth_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.device_users.birth_date IS 'Data de nascimento completa do usuário';


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    device_id character varying(255) NOT NULL,
    name character varying(255),
    model character varying(255),
    manufacturer character varying(255),
    android_version character varying(50),
    api_level integer,
    serial_number character varying(255),
    imei character varying(20),
    mac_address character varying(17),
    ip_address inet,
    battery_level integer DEFAULT 0,
    battery_status character varying(50),
    is_charging boolean DEFAULT false,
    storage_total bigint DEFAULT 0,
    storage_used bigint DEFAULT 0,
    memory_total bigint DEFAULT 0,
    memory_used bigint DEFAULT 0,
    cpu_architecture character varying(50),
    screen_resolution character varying(50),
    screen_density integer,
    network_type character varying(50),
    wifi_ssid character varying(255),
    is_wifi_enabled boolean DEFAULT false,
    is_bluetooth_enabled boolean DEFAULT false,
    is_location_enabled boolean DEFAULT false,
    is_developer_options_enabled boolean DEFAULT false,
    is_adb_enabled boolean DEFAULT false,
    is_unknown_sources_enabled boolean DEFAULT false,
    is_device_owner boolean DEFAULT false,
    is_profile_owner boolean DEFAULT false,
    is_kiosk_mode boolean DEFAULT false,
    app_version character varying(50),
    timezone character varying(100),
    language character varying(10),
    country character varying(10),
    status character varying(20) DEFAULT 'offline'::character varying,
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assigned_device_user_id uuid,
    deleted_at timestamp with time zone,
    os_type character varying(50) DEFAULT 'Android'::character varying,
    meid character varying(20),
    compliance_status character varying(20) DEFAULT 'unknown'::character varying,
    sim_number character varying(50),
    phone_number character varying(50),
    is_rooted boolean DEFAULT false,
    lost_mode boolean DEFAULT false,
    lost_mode_message text,
    data_usage_bytes bigint DEFAULT 0
);


--
-- Name: COLUMN devices.assigned_device_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.devices.assigned_device_user_id IS 'Vínculo com usuário final via foreign key para device_users';


--
-- Name: COLUMN devices.os_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.devices.os_type IS 'Tipo do sistema operacional (Android, iOS, Windows, etc.)';


--
-- Name: COLUMN devices.meid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.devices.meid IS 'Mobile Equipment Identifier para dispositivos CDMA (alternativa ao IMEI)';


--
-- Name: COLUMN devices.compliance_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.devices.compliance_status IS 'Status de conformidade: compliant (conforme), non_compliant (não conforme), unknown (desconhecido)';


--
-- Name: group_alert_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_alert_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    group_id uuid,
    organization_id uuid,
    device_id character varying(255) NOT NULL,
    device_name character varying(255) NOT NULL,
    alert_type character varying(20) NOT NULL,
    alert_title character varying(255) NOT NULL,
    alert_message text NOT NULL,
    alert_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE group_alert_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.group_alert_history IS 'Histórico de alertas de grupos de dispositivos (retenção de 60 dias)';


--
-- Name: COLUMN group_alert_history.alert_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_alert_history.alert_type IS 'Tipo do alerta: error, warning, info';


--
-- Name: COLUMN group_alert_history.alert_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_alert_history.alert_data IS 'Dados adicionais do alerta em formato JSON (batteryLevel, wifiSSID, latitude, longitude, etc)';


--
-- Name: group_available_apps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_available_apps (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    group_id uuid,
    package_name character varying(255) NOT NULL,
    app_name character varying(255) NOT NULL,
    icon_base64 text,
    first_seen_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    seen_in_devices text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: installed_apps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installed_apps (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    device_id uuid,
    package_name character varying(255) NOT NULL,
    app_name character varying(255) NOT NULL,
    icon_base64 text,
    is_system_app boolean DEFAULT false,
    is_enabled boolean DEFAULT true,
    version_name character varying(100),
    version_code integer,
    install_time timestamp with time zone,
    update_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: scheduled_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_commands (
    id integer NOT NULL,
    command_type character varying(100) NOT NULL,
    target_type character varying(50) DEFAULT 'device'::character varying,
    target_id character varying(255),
    target_name character varying(255),
    parameters jsonb DEFAULT '{}'::jsonb,
    schedule_type character varying(20) NOT NULL,
    scheduled_time time without time zone,
    scheduled_date timestamp without time zone,
    day_of_week integer,
    is_active boolean DEFAULT true,
    last_executed_at timestamp without time zone,
    next_execution_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: scheduled_commands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheduled_commands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheduled_commands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheduled_commands_id_seq OWNED BY public.scheduled_commands.id;


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    device_id uuid,
    device_name character varying(255),
    message text NOT NULL,
    android_version character varying(50),
    model character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    received_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    resolved_by uuid
);


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    config_key character varying(255) NOT NULL,
    config_value text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: system_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_configs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    config_key character varying(100) NOT NULL,
    config_value jsonb NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: uem_computer_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uem_computer_status_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    status character varying(20) NOT NULL,
    memory_used bigint,
    storage_used bigint,
    cpu_usage_percent numeric(5,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE uem_computer_status_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.uem_computer_status_history IS 'Histórico de status e métricas dos computadores';


--
-- Name: uem_computers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uem_computers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    computer_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    hostname character varying(255),
    domain character varying(255),
    os_type character varying(50) NOT NULL,
    os_version character varying(100),
    os_build character varying(50),
    cpu_model character varying(255),
    cpu_cores integer,
    cpu_threads integer,
    cpu_architecture character varying(50),
    memory_total bigint DEFAULT 0,
    memory_used bigint DEFAULT 0,
    storage_total bigint DEFAULT 0,
    storage_used bigint DEFAULT 0,
    ip_address inet,
    mac_address character varying(17),
    network_type character varying(50),
    wifi_ssid character varying(255),
    is_wifi_enabled boolean DEFAULT false,
    is_bluetooth_enabled boolean DEFAULT false,
    agent_version character varying(50),
    agent_installed_at timestamp with time zone,
    last_heartbeat timestamp with time zone,
    logged_in_user character varying(255),
    assigned_device_user_id uuid,
    antivirus_installed boolean DEFAULT false,
    antivirus_enabled boolean DEFAULT false,
    antivirus_name character varying(255),
    firewall_enabled boolean DEFAULT false,
    encryption_enabled boolean DEFAULT false,
    status character varying(20) DEFAULT 'offline'::character varying,
    compliance_status character varying(20) DEFAULT 'unknown'::character varying,
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE uem_computers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.uem_computers IS 'Tabela para armazenar informações de computadores gerenciados pelo UEM';


--
-- Name: uem_installed_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uem_installed_programs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    program_name character varying(255) NOT NULL,
    publisher character varying(255),
    version character varying(100),
    install_date timestamp with time zone,
    install_location text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE uem_installed_programs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.uem_installed_programs IS 'Programas instalados nos computadores UEM';


--
-- Name: uem_remote_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uem_remote_actions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    computer_id uuid,
    action_type character varying(50) NOT NULL,
    action_status character varying(20) DEFAULT 'pending'::character varying,
    requested_by uuid,
    executed_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE uem_remote_actions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.uem_remote_actions IS 'Histórico de ações remotas executadas nos computadores';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    role character varying(50) DEFAULT 'viewer'::character varying,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: web_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying,
    created_by character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: admin_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users ALTER COLUMN id SET DEFAULT nextval('public.admin_users_id_seq'::regclass);


--
-- Name: alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts ALTER COLUMN id SET DEFAULT nextval('public.alerts_id_seq'::regclass);


--
-- Name: computer_status_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_status_history ALTER COLUMN id SET DEFAULT nextval('public.computer_status_history_id_seq'::regclass);


--
-- Name: config_backups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_backups ALTER COLUMN id SET DEFAULT nextval('public.config_backups_id_seq'::regclass);


--
-- Name: device_restrictions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_restrictions ALTER COLUMN id SET DEFAULT nextval('public.device_restrictions_id_seq'::regclass);


--
-- Name: scheduled_commands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_commands ALTER COLUMN id SET DEFAULT nextval('public.scheduled_commands_id_seq'::regclass);


--
-- Data for Name: admin_passwords; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_passwords (id, password_hash, is_active, created_at, expires_at) FROM stdin;
68f72fe8-fac5-4a0f-a9d5-863766b30b7f	admin123	t	2025-10-02 13:38:10.459288-03	\N
\.


--
-- Data for Name: admin_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_users (id, username, password_hash, name, role, created_at, last_login) FROM stdin;
1	adm	fcef631eab0be0f69d940e737b136e0cbcf4f6f1de81f50822862002655af92e	Administrador	admin	2026-03-12 11:28:41.928359-03	\N
\.


--
-- Data for Name: alerts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.alerts (id, type, severity, device_id, device_name, message, details, is_read, is_resolved, resolved_at, created_at) FROM stdin;
\.


--
-- Data for Name: app_access_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_access_history (id, device_id, package_name, app_name, access_date, first_access_time, last_access_time, access_count, total_duration_ms, created_at, updated_at, is_allowed) FROM stdin;
fc7f31cd-4b8d-4af2-9eaf-6f6396fd2d02	e875df7bca9807e2	com.google.android.youtube	YouTube	2025-10-29	2025-10-29 06:31:58.575-03	2025-10-29 08:07:39.557-03	3	0	2025-10-29 08:06:28.158211-03	2025-10-29 08:07:40.150641-03	t
60c8346c-22d2-481d-a8a5-bede5baf91ab	e875df7bca9807e2	com.android.launcher3	Quickstep	2025-10-29	2025-10-29 08:07:41.728-03	2025-10-29 08:07:41.728-03	1	0	2025-10-29 08:07:42.279596-03	2025-10-29 08:07:42.279596-03	f
c77b8d47-34eb-4d56-a8a8-3720517a756f	d76c64d820c5509b	com.google.android.permissioncontroller	Controlador de permissões	2025-12-16	2025-12-16 07:21:59.426-03	2025-12-16 07:21:59.426-03	1	0	2025-12-16 07:21:58.879711-03	2025-12-16 07:21:58.879711-03	f
01efd483-430d-4804-8d1d-cffe251b8fdc	e875df7bca9807e2	com.android.settings	Configurações	2025-10-30	2025-10-30 13:45:26.152-03	2025-10-30 13:45:59.633-03	2	0	2025-10-30 13:45:26.562606-03	2025-10-30 13:46:00.063971-03	f
84ca031d-ae31-471c-9fe8-c67a4bc75bf8	b074c8e0a876f8cc	com.android.settings	Configurações	2025-10-24	2025-10-24 12:05:14.915-03	2025-10-24 12:17:33.863-03	34	0	2025-10-24 12:05:13.954893-03	2025-10-27 12:03:46.775003-03	t
091c7e18-11b3-4f06-8393-63971df6af98	b074c8e0a876f8cc	com.google.android.apps.maps	Maps	2025-10-24	2025-10-24 12:18:47.762-03	2025-10-24 12:18:47.762-03	1	0	2025-10-24 12:18:46.786555-03	2025-10-27 12:03:46.775003-03	t
845f07ba-4c8d-4c51-ac27-e75f1754e880	b074c8e0a876f8cc	com.google.android.youtube	YouTube	2025-10-24	2025-10-24 11:51:59.516-03	2025-10-24 12:32:00.607-03	25	0	2025-10-24 11:51:58.583685-03	2025-10-27 12:03:46.775003-03	t
e141be11-dbf3-47ed-a1bd-8302075d42ac	b074c8e0a876f8cc	com.android.launcher3	Quickstep	2025-10-24	2025-10-24 11:53:24.137-03	2025-10-24 11:53:24.137-03	2	0	2025-10-24 11:53:23.243431-03	2025-10-27 12:03:46.775003-03	t
5a079f0a-632e-46ff-b76c-34b429d1726e	24fbc8102bf8ef66	com.android.settings	Configurações	2025-10-24	2025-10-24 15:10:48.739-03	2025-10-24 15:17:52.177-03	2	0	2025-10-24 15:10:48.511961-03	2025-10-27 12:03:46.775003-03	f
ca541888-dea7-402c-b7d5-4c97b61d1385	b074c8e0a876f8cc	com.google.android.apps.youtube.music	YouTube Music	2025-10-24	2025-10-24 11:52:04.554-03	2025-10-24 12:04:44.806-03	19	0	2025-10-24 11:52:03.60985-03	2025-10-27 12:03:46.775003-03	t
a1781606-82f4-459c-94dc-e9339e27b8b8	b074c8e0a876f8cc	com.android.chrome	Chrome	2025-10-24	2025-10-24 12:05:24.981-03	2025-10-24 12:05:24.981-03	11	0	2025-10-24 12:05:24.030691-03	2025-10-27 12:03:46.775003-03	t
9aaad752-982c-43e3-912d-4d7223b0c762	24fbc8102bf8ef66	com.google.android.apps.youtube.music	YouTube Music	2025-10-24	2025-10-24 15:14:05.52-03	2025-10-24 15:26:23.714-03	3	0	2025-10-24 15:14:05.269174-03	2025-10-27 12:03:46.775003-03	t
d56cd904-f2de-49b7-9589-774a99f939fb	24fbc8102bf8ef66	com.google.android.youtube	YouTube	2025-10-24	2025-10-24 15:12:24.496-03	2025-10-24 16:21:53.258-03	7	0	2025-10-24 15:12:24.258184-03	2025-10-27 12:03:46.775003-03	t
996eea3b-a485-4262-903a-04ee960bf47f	e875df7bca9807e2	com.android.settings.intelligence	Sugestões de Definições	2025-10-30	2025-10-30 13:46:00.677-03	2025-10-30 13:46:00.677-03	1	0	2025-10-30 13:46:01.042952-03	2025-10-30 13:46:01.042952-03	f
500a8af0-b9c2-4489-b033-78dfee7c0772	24fbc8102bf8ef66	com.google.android.youtube	YouTube	2025-10-27	2025-10-27 06:54:04.101-03	2025-10-27 09:39:21.801-03	22	0	2025-10-27 06:54:06.699231-03	2025-10-27 12:03:46.775003-03	t
0a83d43c-af36-440a-8499-462679b2afe8	24fbc8102bf8ef66	com.android.settings	Configurações	2025-10-27	2025-10-27 06:27:31.804-03	2025-10-27 10:17:37.456-03	8	0	2025-10-27 06:28:09.494124-03	2025-10-27 12:03:46.775003-03	f
795a361a-3093-4228-b4c5-8491b9b71a3c	e875df7bca9807e2	com.android.launcher3	Quickstep	2025-10-30	2025-10-30 13:46:08.744-03	2025-10-30 13:46:08.744-03	1	0	2025-10-30 13:46:09.116133-03	2025-10-30 13:46:09.116133-03	f
e4abf3d1-cdfe-4c7d-a9da-32a0a8ab5d35	e875df7bca9807e2	com.google.android.permissioncontroller	Controlador de permissões	2025-10-31	2025-10-31 10:20:40.981-03	2025-10-31 10:20:40.981-03	1	0	2025-10-31 10:20:40.279193-03	2025-10-31 10:20:40.279193-03	f
f87d658e-f97e-4c7d-b5d1-f7799735be6c	e875df7bca9807e2	com.android.launcher3	Quickstep	2025-10-31	2025-10-31 10:20:42.023-03	2025-10-31 10:20:42.023-03	1	0	2025-10-31 10:20:41.811846-03	2025-10-31 10:20:41.811846-03	f
f967b788-4165-43ae-9934-ffc5c86b9b18	e875df7bca9807e2	com.heytap.market	App Market	2025-10-31	2025-10-31 15:18:09.132-03	2025-10-31 15:18:09.132-03	1	0	2025-10-31 15:18:08.755133-03	2025-10-31 15:18:08.755133-03	f
6b9f9e5a-9676-4cb6-9197-1ac8d50af980	d76c64d820c5509b	com.google.android.permissioncontroller	Controlador de permissões	2025-12-03	2025-12-03 15:01:17.675-03	2025-12-03 15:01:17.675-03	1	0	2025-12-16 07:20:57.606549-03	2025-12-16 07:20:57.606549-03	f
46a64839-40a8-4a3e-ae93-cb36a27f2dc0	e875df7bca9807e2	com.android.settings	Configurações	2025-10-27	2025-10-27 11:04:56.704-03	2025-10-27 11:04:56.704-03	1	0	2025-10-29 08:06:27.99987-03	2025-10-29 08:06:27.99987-03	f
a2a95d74-2ae3-446a-aadc-c979f15eef49	e875df7bca9807e2	com.google.android.apps.messaging	Mensagens	2025-11-01	2025-11-01 08:44:17.305-03	2025-11-01 08:47:16.119-03	2	0	2025-11-01 09:00:19.240806-03	2025-11-01 09:00:19.244852-03	f
afc210cc-061d-44b2-bdf6-ffd3093a41ad	e875df7bca9807e2	com.google.android.networkstack.tethering	Tethering	2025-11-03	2025-11-02 21:00:01.301-03	2025-11-03 08:33:54.76-03	42	0	2025-11-03 06:13:41.882585-03	2025-11-03 08:33:57.414416-03	f
be12c770-86dc-40c6-a263-f638b8cb7caa	d447955e6dc07070	com.android.settings	Configurações	2025-12-02	2025-12-02 15:28:54.461-03	2025-12-02 15:28:54.461-03	1	0	2025-12-02 15:28:54.790758-03	2025-12-02 15:28:54.790758-03	f
945e890e-0a15-4dc8-9c3b-fc19a67028af	d447955e6dc07070	com.google.android.gms	Google Play Services	2025-12-02	2025-12-02 15:29:04.616-03	2025-12-02 15:29:04.616-03	1	0	2025-12-02 15:29:04.911446-03	2025-12-02 15:29:04.911446-03	f
f7171ba0-0e7b-46b0-b1c7-792bca5f0b3d	971c21a736c31588	com.android.settings	Configurações	2025-12-02	2025-12-02 15:37:15.462-03	2025-12-02 15:37:15.462-03	1	0	2025-12-02 15:37:15.620439-03	2025-12-02 15:37:15.620439-03	f
90489336-0ec9-496f-9ead-5e937e284a5c	b142ca5b49b999fe	com.android.settings	Configurações	2025-12-02	2025-12-02 15:57:39.082-03	2025-12-02 15:57:39.082-03	1	0	2025-12-02 15:57:39.996425-03	2025-12-02 15:57:39.996425-03	f
f7e91f02-a432-4257-9ec9-f6fe971184be	b142ca5b49b999fe	com.android.launcher3	Quickstep	2025-12-02	2025-12-02 15:58:09.257-03	2025-12-02 15:58:09.257-03	1	0	2025-12-02 15:58:10.172759-03	2025-12-02 15:58:10.172759-03	f
b81addcb-f418-403d-b156-1d73386e42fa	b142ca5b49b999fe	com.google.android.permissioncontroller	Controlador de permissões	2025-12-02	2025-12-02 15:58:44.399-03	2025-12-02 15:58:44.399-03	1	0	2025-12-02 15:58:45.325345-03	2025-12-02 15:58:45.325345-03	f
94fd5bfe-2ba0-48fe-aebe-b4b22e6a9982	b142ca5b49b999fe	com.google.android.youtube	YouTube	2025-12-02	2025-12-02 15:58:45.421-03	2025-12-02 15:58:45.421-03	1	0	2025-12-02 15:58:46.345552-03	2025-12-02 15:58:46.345552-03	t
fccbbb40-cf55-4365-a876-7e062edfabab	b142ca5b49b999fe	com.google.android.youtube	YouTube	2025-12-03	2025-12-03 07:17:30.368-03	2025-12-03 09:56:53.215-03	2	0	2025-12-03 07:17:33.798891-03	2025-12-03 09:56:55.543257-03	t
46c7c4f2-925a-403f-b8f7-70b82cc4a650	e875df7bca9807e2	com.google.android.ext.services	Android Services Library	2025-11-01	2025-11-01 08:47:18.18-03	2025-11-01 16:28:58.532-03	35	0	2025-11-01 09:00:19.246324-03	2025-11-03 06:13:41.699346-03	f
8b4c04cd-a72c-4f8a-a5be-f997b6d6f66f	e875df7bca9807e2	com.google.android.youtube	YouTube	2025-10-27	2025-10-27 10:56:54.004-03	2025-10-27 20:59:27.404-03	40	0	2025-10-29 08:06:27.990354-03	2025-10-29 08:06:28.069771-03	t
bdfb89de-d102-4fce-96e7-b182999dd64d	e875df7bca9807e2	com.google.android.networkstack.tethering	Tethering	2025-11-01	2025-11-01 16:29:07.612-03	2025-11-01 20:35:14.161-03	18	0	2025-11-03 06:13:41.701163-03	2025-11-03 06:13:41.72822-03	f
85aaa985-8fb1-41a6-a1e6-4c7abc30b922	e875df7bca9807e2	com.google.android.youtube	YouTube	2025-10-28	2025-10-27 21:31:32.283-03	2025-10-28 11:10:04.734-03	38	0	2025-10-29 08:06:28.071259-03	2025-10-29 08:06:28.143334-03	t
3a0ccba6-4f21-446b-bd26-f53a96c1c424	e875df7bca9807e2	com.android.settings	Configurações	2025-10-28	2025-10-28 07:59:15.96-03	2025-10-28 11:18:33.173-03	12	0	2025-10-29 08:06:28.128778-03	2025-10-29 08:06:28.153892-03	f
9c1b09d5-194b-4820-acf5-e7cb8a40d711	e875df7bca9807e2	com.amazon.mShop.android.shopping	Amazon Shopping	2025-10-28	2025-10-28 11:17:28.584-03	2025-10-28 11:18:43.261-03	2	0	2025-10-29 08:06:28.149542-03	2025-10-29 08:06:28.155251-03	f
961491f4-d439-4635-9479-2a422a4fb72f	e875df7bca9807e2	com.android.launcher3	Quickstep	2025-10-28	2025-10-28 11:18:01.948-03	2025-10-28 11:18:47.33-03	2	0	2025-10-29 08:06:28.151758-03	2025-10-29 08:06:28.156613-03	f
d41ecfed-bb9b-4396-9f55-fc87885111ff	fb74e8e6cf7a1263	com.google.android.youtube	YouTube	2025-10-28	2025-10-28 08:01:32.461-03	2025-10-28 10:43:12.591-03	3	0	2025-10-29 08:06:28.603884-03	2025-10-29 08:06:28.611007-03	t
0e5c9953-3cdb-4328-b1fa-a47d3e4e0695	fb74e8e6cf7a1263	com.google.android.youtube	YouTube	2025-10-29	2025-10-29 08:06:27.491-03	2025-10-29 08:06:27.491-03	1	0	2025-10-29 08:06:28.61234-03	2025-10-29 08:06:28.61234-03	t
9625c0fc-eb8d-431a-9e05-5f491f0f8dc8	e875df7bca9807e2	com.google.android.apps.messaging	Mensagens	2025-11-02	2025-11-02 08:45:11.218-03	2025-11-02 08:45:11.218-03	1	0	2025-11-03 06:13:41.805291-03	2025-11-03 06:13:41.805291-03	f
e3b4cd16-b2e5-447b-8b8b-f5357b490b8b	e875df7bca9807e2	com.google.android.googlequicksearchbox	Google	2025-11-02	2025-11-02 08:51:07.532-03	2025-11-02 10:35:48.379-03	10	0	2025-11-03 06:13:41.807794-03	2025-11-03 06:13:41.821312-03	f
ccdc7a98-e2e4-47d6-9c90-e7735c817210	e875df7bca9807e2	com.google.android.ext.services	Android Services Library	2025-11-02	2025-11-02 10:35:51.428-03	2025-11-02 10:35:51.428-03	1	0	2025-11-03 06:13:41.822765-03	2025-11-03 06:13:41.822765-03	f
094f47c4-4a72-4955-aa15-22bc6d608a9d	e875df7bca9807e2	com.google.android.networkstack.tethering	Tethering	2025-11-02	2025-11-01 21:00:01.488-03	2025-11-02 20:32:24.469-03	91	0	2025-11-03 06:13:41.729562-03	2025-11-03 06:13:41.881303-03	f
712af6bd-113c-43b8-bd1a-65b808cabdbb	d76c64d820c5509b	com.android.launcher3	Quickstep	2025-12-16	2025-12-16 07:22:09.724-03	2025-12-16 07:22:09.724-03	1	0	2025-12-16 07:22:09.061893-03	2025-12-16 07:22:09.061893-03	f
a30912ab-4e3d-4c3d-8daf-36b2e5a20f44	b142ca5b49b999fe	com.android.launcher3	Quickstep	2025-12-03	2025-12-03 07:17:32.394-03	2025-12-03 07:46:15.657-03	2	0	2025-12-03 07:17:35.367275-03	2025-12-03 07:46:18.059007-03	f
d447942f-05db-4b6a-b8cf-b385607dcdb1	d76c64d820c5509b	com.google.android.apps.photos	Fotos	2025-12-03	2025-12-03 15:01:57.178-03	2025-12-03 15:01:57.178-03	1	0	2025-12-16 07:20:57.616141-03	2025-12-16 07:20:57.616141-03	f
8db8b5fe-9cbd-4b12-b10d-19912aa7ec05	d76c64d820c5509b	com.android.settings	Configurações	2025-12-03	2025-12-03 14:57:51.027-03	2025-12-03 15:02:43.615-03	3	0	2025-12-16 07:20:57.602555-03	2025-12-16 07:20:57.619681-03	f
a1772f1d-5f86-4038-b109-c97466d01c63	d76c64d820c5509b	com.google.android.youtube	YouTube	2025-12-03	2025-12-03 15:01:19.711-03	2025-12-03 15:02:45.641-03	2	0	2025-12-16 07:20:57.609201-03	2025-12-16 07:20:57.621801-03	f
e44658c0-e1fb-4dc4-b8fa-a18256cd9bae	b142ca5b49b999fe	com.android.settings	Configurações	2025-12-03	2025-12-03 06:37:51.566-03	2025-12-03 10:04:13.916-03	6	0	2025-12-03 06:37:54.032307-03	2025-12-03 10:04:16.261245-03	f
c1bb6b14-85a7-45e4-8ae4-8f49cc6c4e58	b142ca5b49b999fe	com.google.android.gms	Google Play Services	2025-12-03	2025-12-03 10:04:23.023-03	2025-12-03 10:04:23.023-03	1	0	2025-12-03 10:04:25.350739-03	2025-12-03 10:04:25.350739-03	f
c1048a99-a569-450b-83fe-5786a06c7f8a	d76c64d820c5509b	com.android.settings	Configurações	2025-12-04	2025-12-04 08:01:22.445-03	2025-12-04 08:01:22.445-03	1	0	2025-12-16 07:20:57.623772-03	2025-12-16 07:20:57.623772-03	f
a794b378-5dd2-48f3-97ff-da82a725baf4	d76c64d820c5509b	com.android.settings.intelligence	Sugestões de Definições	2025-12-04	2025-12-04 08:01:23.474-03	2025-12-04 08:01:23.474-03	1	0	2025-12-16 07:20:57.626844-03	2025-12-16 07:20:57.626844-03	f
d75bdf5b-5ce1-4c11-8233-8cc3fff0de38	d76c64d820c5509b	com.google.android.permissioncontroller	Controlador de permissões	2025-12-04	2025-12-04 08:01:36.636-03	2025-12-04 08:01:36.636-03	1	0	2025-12-16 07:20:57.630325-03	2025-12-16 07:20:57.630325-03	f
3a93533f-824f-4eda-8246-88652f7a66ce	d76c64d820c5509b	com.android.launcher3	Quickstep	2025-12-04	2025-12-04 08:01:38.67-03	2025-12-04 08:01:38.67-03	1	0	2025-12-16 07:20:57.63266-03	2025-12-16 07:20:57.63266-03	f
ac677ba0-3681-433c-b988-798f6b592cce	d76c64d820c5509b	com.google.android.apps.messaging	Mensagens	2025-12-04	2025-12-04 14:47:46.491-03	2025-12-04 14:55:33.497-03	3	0	2025-12-16 07:20:57.634576-03	2025-12-16 07:20:57.638067-03	f
326df166-fd3a-47ce-9214-7cb631c4e9a3	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-04	2025-12-04 14:57:39.591-03	2025-12-04 14:57:39.591-03	1	0	2025-12-16 07:20:57.640151-03	2025-12-16 07:20:57.640151-03	f
8249aaab-adb9-4a5a-9717-4163155a6bfc	47fa69c563c8813c	com.android.launcher3	Quickstep	2025-12-16	2025-12-16 08:39:17.38-03	2025-12-16 08:47:16.456-03	2	0	2025-12-16 08:39:16.234516-03	2025-12-16 09:19:49.084833-03	f
2bece294-3291-4c7a-8c17-57d50b58a524	d76c64d820c5509b	com.google.android.apps.messaging	Mensagens	2025-12-05	2025-12-05 15:00:00.944-03	2025-12-05 16:01:47.41-03	6	0	2025-12-16 07:20:57.642938-03	2025-12-16 07:20:57.650946-03	f
fc8455a1-c46e-4ed5-a690-06115a2b70be	0de2642c15b8af77	com.android.settings.intelligence	Sugestões de Definições	2025-12-03	2025-12-03 12:03:23.503-03	2025-12-03 12:03:23.503-03	1	0	2025-12-03 12:03:24.920056-03	2025-12-03 12:03:24.920056-03	f
3d556991-1b09-4795-a556-9eb5bcb77ac4	d76c64d820c5509b	com.android.providers.calendar	Armazenamento de agenda	2025-12-05	2025-12-05 16:20:06.802-03	2025-12-05 18:00:00.317-03	8	0	2025-12-16 07:20:57.652579-03	2025-12-16 07:20:57.664111-03	f
60d140ee-2b66-46cd-bfaf-0742b3555d93	d76c64d820c5509b	com.heytap.pictorial	Magazine da tela bloqueada	2025-12-05	2025-12-05 18:00:16.876-03	2025-12-05 18:00:16.876-03	1	0	2025-12-16 07:20:57.665316-03	2025-12-16 07:20:57.665316-03	f
2aa65b34-d4bf-463a-8b16-46a1f8793dec	0de2642c15b8af77	com.android.launcher3	Quickstep	2025-12-03	2025-12-03 10:24:56.163-03	2025-12-03 12:09:44.26-03	19	0	2025-12-03 10:24:57.642407-03	2025-12-03 12:09:45.682871-03	f
1012a97b-e5d0-49fe-b3c8-74d67f1d969f	0de2642c15b8af77	com.google.android.permissioncontroller	Controlador de permissões	2025-12-03	2025-12-03 12:09:56.516-03	2025-12-03 12:09:56.516-03	1	0	2025-12-03 12:54:25.394665-03	2025-12-03 12:54:25.394665-03	f
1457b5f4-6915-484d-afac-bd2941041aa0	0de2642c15b8af77	com.heytap.market	App Market	2025-12-03	2025-12-03 12:54:23.886-03	2025-12-03 12:54:23.886-03	1	0	2025-12-03 12:54:25.397549-03	2025-12-03 12:54:25.397549-03	f
49d1cc6b-cb73-4b87-b934-b4ce263af2fe	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-05	2025-12-05 18:00:23.93-03	2025-12-05 18:00:23.93-03	1	0	2025-12-16 07:20:57.667493-03	2025-12-16 07:20:57.667493-03	f
8892da0b-f099-4c3b-a34f-3dac26e26504	0de2642c15b8af77	com.android.settings	Configurações	2025-12-03	2025-12-03 11:23:03.192-03	2025-12-03 14:21:45.583-03	7	0	2025-12-03 11:23:04.65285-03	2025-12-03 14:21:46.923267-03	f
90aea887-1d25-460f-b694-c3bcad7a0e1e	0de2642c15b8af77	com.google.android.gms	Google Play Services	2025-12-03	2025-12-03 14:21:51.674-03	2025-12-03 14:21:51.674-03	1	0	2025-12-03 14:21:53.021485-03	2025-12-03 14:21:53.021485-03	f
21a2b9f2-d15f-45a3-bc1a-eeca01c5cff9	47fa69c563c8813c	com.google.android.permissioncontroller	Controlador de permissões	2025-12-16	2025-12-16 08:39:12.314-03	2025-12-16 10:39:42.36-03	3	0	2025-12-16 08:39:11.220363-03	2025-12-16 10:39:41.129495-03	f
581a7049-bd7f-46d7-bc90-f8fa1fb498c9	b6ac110702ee4e03	com.google.android.permissioncontroller	Controlador de permissões	2025-12-03	2025-12-03 14:33:02.462-03	2025-12-03 14:33:02.462-03	1	0	2025-12-03 14:33:04.111116-03	2025-12-03 14:33:04.111116-03	f
098a35cc-0403-452f-965b-9388f7dbf4e1	b6ac110702ee4e03	com.android.settings	Configurações	2025-12-03	2025-12-03 14:32:03.61-03	2025-12-03 14:43:52.334-03	2	0	2025-12-03 14:33:04.107828-03	2025-12-03 14:43:53.980862-03	f
dc0a169d-f098-4b2f-a4db-9ff8814e09d6	b6ac110702ee4e03	com.google.android.gms	Google Play Services	2025-12-03	2025-12-03 14:43:56.409-03	2025-12-03 14:43:56.409-03	1	0	2025-12-03 14:43:58.04349-03	2025-12-03 14:43:58.04349-03	f
f7e467a9-9231-4b73-8056-f0cbf073d84f	47fa69c563c8813c	com.android.settings	Configurações	2025-12-16	2025-12-16 08:38:53.893-03	2025-12-16 10:47:02.451-03	15	0	2025-12-16 08:38:52.824025-03	2025-12-16 10:47:01.268639-03	f
4621e7d0-4528-4999-b6c5-214342f4c8f0	16cb9c484de07dfb	com.oplus.gamespace	Jogos	2025-12-17	2025-12-17 11:45:32.02-03	2025-12-17 11:45:32.02-03	1	0	2025-12-17 11:45:32.330247-03	2025-12-17 11:45:32.330247-03	f
247ac173-f718-485b-8328-1659a3c5862e	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-05	2025-12-05 18:00:35.011-03	2025-12-05 20:46:29.865-03	11	0	2025-12-16 07:20:57.669605-03	2025-12-16 07:20:57.68496-03	f
c11cfb71-2e71-433c-b46a-dbc9e0429e51	16cb9c484de07dfb	com.android.settings	Configurações	2025-12-17	2025-12-17 11:45:17.782-03	2025-12-17 13:47:46.692-03	5	0	2025-12-17 11:45:18.016304-03	2025-12-17 13:47:46.870877-03	f
481ffaf1-d83d-4759-a8c9-e2dcbb673ade	fa7a2953dda27a79	com.google.android.googlequicksearchbox	Google	2025-12-17	2025-12-17 15:34:05.389-03	2025-12-17 15:34:05.389-03	1	0	2025-12-17 15:34:05.19958-03	2025-12-17 15:34:05.19958-03	f
dc16e743-acc2-487a-92d8-660344f408c9	fa7a2953dda27a79	com.google.android.gms	Google Play Services	2025-12-17	2025-12-17 15:35:20.993-03	2025-12-17 15:35:20.993-03	1	0	2025-12-17 15:35:20.791081-03	2025-12-17 15:35:20.791081-03	f
342989aa-9d90-4275-9f8c-7a5cea16cf6b	9683ba8f5197ec9e	com.heytap.market	App Market	2025-12-20	2025-12-20 06:56:39.034-03	2025-12-20 06:56:39.034-03	1	0	2025-12-23 07:08:03.131913-03	2025-12-23 07:08:03.131913-03	f
3bda6ba5-87ad-4d5e-87fb-1e430e16c61e	d76c64d820c5509b	com.google.android.adservices.api	Privacidade de anúncios	2025-12-06	2025-12-06 15:21:17.884-03	2025-12-06 16:13:45.035-03	4	0	2025-12-16 07:20:57.789452-03	2025-12-16 07:20:57.79516-03	f
41764791-2f6a-4128-98f3-22a9051f42ef	d76c64d820c5509b	com.android.providers.calendar	Armazenamento de agenda	2025-12-06	2025-12-06 16:20:06.987-03	2025-12-06 18:00:00.646-03	11	0	2025-12-16 07:20:57.797144-03	2025-12-16 07:20:57.813864-03	f
f339d202-77d7-4758-8879-f17061ea3232	d76c64d820c5509b	com.heytap.pictorial	Magazine da tela bloqueada	2025-12-06	2025-12-06 18:11:49.756-03	2025-12-06 18:11:49.756-03	1	0	2025-12-16 07:20:57.815184-03	2025-12-16 07:20:57.815184-03	f
ec01ddec-a7ea-42fb-a00d-3547f3a998ce	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-06	2025-12-06 18:11:57.812-03	2025-12-06 18:11:57.812-03	1	0	2025-12-16 07:20:57.817518-03	2025-12-16 07:20:57.817518-03	f
1f07855a-a0b4-40e5-9153-656cff2d41ad	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-06	2025-12-05 21:00:01.135-03	2025-12-06 20:53:36.307-03	82	0	2025-12-16 07:20:57.686771-03	2025-12-16 07:20:57.835806-03	f
f1d394f9-20c7-43ab-918c-c89ee4c889cb	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-07	2025-12-06 21:00:01.648-03	2025-12-07 04:48:08.118-03	32	0	2025-12-16 07:20:57.837211-03	2025-12-16 07:20:57.877912-03	f
ac7ac472-f0da-452c-90da-19ae86f45b6a	d76c64d820c5509b	com.google.android.googlequicksearchbox	Google	2025-12-07	2025-12-07 15:40:28.515-03	2025-12-07 18:40:52.006-03	14	0	2025-12-16 07:20:57.879244-03	2025-12-16 07:20:57.8961-03	f
0d3264a6-8d91-4d44-9ba0-2bb180e1e805	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-07	2025-12-07 18:40:55.066-03	2025-12-07 20:55:11.988-03	14	0	2025-12-16 07:20:57.897285-03	2025-12-16 07:20:57.914952-03	f
d7783377-cb5e-47a5-8aec-06b2f98f2c0e	47fa69c563c8813c	com.android.settings.intelligence	Sugestões de Definições	2025-12-16	2025-12-16 10:39:32.173-03	2025-12-16 10:39:32.173-03	1	0	2025-12-16 10:39:30.955173-03	2025-12-16 10:39:30.955173-03	f
0d99b284-0b6e-451f-adf8-e4fd3abfafa4	ba92d0eacb5df9b1	com.google.android.permissioncontroller	Controlador de permissões	2025-12-16	2025-12-16 11:35:42.261-03	2025-12-16 11:35:42.261-03	1	0	2025-12-16 11:35:40.256832-03	2025-12-16 11:35:40.256832-03	f
37295d80-665a-4453-8817-73b5bf4c8321	ba92d0eacb5df9b1	com.android.settings	Configurações	2025-12-16	2025-12-16 11:35:15.777-03	2025-12-16 11:51:36.963-03	9	0	2025-12-16 11:35:13.734697-03	2025-12-16 11:51:34.933078-03	f
f859bd02-cacf-42be-a68d-5e93a0a3ec45	16cb9c484de07dfb	com.android.launcher3	Quickstep	2025-12-17	2025-12-17 13:26:08.487-03	2025-12-17 13:39:20.773-03	3	0	2025-12-17 13:26:08.683984-03	2025-12-17 13:39:20.937843-03	f
b3820ee8-8a8f-4a31-8a47-51adc48864c5	fa7a2953dda27a79	com.amazon.mShop.android.shopping	Amazon Shopping	2025-12-17	2025-12-17 15:59:32.863-03	2025-12-17 15:59:32.863-03	1	0	2025-12-17 15:59:32.821266-03	2025-12-17 15:59:32.821266-03	f
3114908b-d519-4118-add9-f4235c8986bb	9683ba8f5197ec9e	com.google.android.googlequicksearchbox	Google	2025-12-24	2025-12-24 07:51:14.111-03	2025-12-24 09:20:29.25-03	14	0	2025-12-24 07:51:14.567478-03	2025-12-24 09:20:29.656005-03	f
1cecaaf9-2b0a-4015-b523-8d228d1a9682	9683ba8f5197ec9e	com.google.android.apps.subscriptions.red	Google One	2025-12-21	2025-12-21 07:00:00.817-03	2025-12-21 08:00:01.404-03	5	0	2025-12-23 07:08:03.134875-03	2025-12-23 07:08:03.139884-03	f
7a4f28f5-9f7d-4a4e-afb1-2bb2e2d3c8ea	9683ba8f5197ec9e	com.google.android.apps.messaging	Mensagens	2025-12-23	2025-12-23 07:08:02.601-03	2025-12-23 07:24:32.951-03	3	0	2025-12-23 07:08:03.140849-03	2025-12-23 07:24:33.472634-03	f
89279b53-b750-4a92-b586-2dca43b57913	d76c64d820c5509b	com.google.android.apps.messaging	Mensagens	2025-12-08	2025-12-08 15:10:19.784-03	2025-12-08 16:00:00.268-03	5	0	2025-12-16 07:20:58.052771-03	2025-12-16 07:20:58.059817-03	f
89d7068d-da33-4510-8589-1cc35292a66c	d76c64d820c5509b	com.google.android.googlequicksearchbox	Google	2025-12-08	2025-12-08 16:03:57.962-03	2025-12-08 18:45:09.881-03	14	0	2025-12-16 07:20:58.061203-03	2025-12-16 07:20:58.08155-03	f
dcd7221f-51db-4aed-9dfb-5f912d325693	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-08	2025-12-07 21:00:00.399-03	2025-12-08 18:45:12.978-03	41	0	2025-12-16 07:20:57.916545-03	2025-12-16 07:20:58.083-03	f
e8ca2903-ccd9-4a43-b566-f7ab8d02025c	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-08	2025-12-08 06:41:58.315-03	2025-12-08 20:59:35.792-03	61	0	2025-12-16 07:20:57.977547-03	2025-12-16 07:20:58.10112-03	f
258eef92-b870-4677-bbd6-94d2b40dbf26	d76c64d820c5509b	com.google.android.apps.messaging	Mensagens	2025-12-09	2025-12-09 15:26:55.459-03	2025-12-09 15:26:55.459-03	1	0	2025-12-16 07:20:58.179459-03	2025-12-16 07:20:58.179459-03	f
9a39b146-b697-4e71-b2c1-a4e20b3952ab	d76c64d820c5509b	com.google.android.googlequicksearchbox	Google	2025-12-09	2025-12-09 16:00:00.754-03	2025-12-09 16:44:28.48-03	4	0	2025-12-16 07:20:58.181768-03	2025-12-16 07:20:58.186394-03	f
f5f46c5d-562d-4690-b8b7-b6a0936e7225	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-09	2025-12-09 16:44:31.548-03	2025-12-09 16:44:31.548-03	1	0	2025-12-16 07:20:58.187899-03	2025-12-16 07:20:58.187899-03	f
82ac7405-c45a-4763-b6bc-2cc6db7fbc77	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-09	2025-12-08 21:14:52.714-03	2025-12-09 20:51:59.036-03	76	0	2025-12-16 07:20:58.102576-03	2025-12-16 07:20:58.224971-03	f
b47291a3-0d67-47d1-9704-cbd3fb162a88	d76c64d820c5509b	com.google.android.apps.messaging	Mensagens	2025-12-10	2025-12-10 15:25:27.018-03	2025-12-10 15:57:39.568-03	4	0	2025-12-16 07:20:58.28438-03	2025-12-16 07:20:58.288875-03	f
7c12da7d-e679-419d-80d3-e2dcf8b16962	d76c64d820c5509b	com.google.android.googlequicksearchbox	Google	2025-12-10	2025-12-10 15:58:41.332-03	2025-12-10 19:03:12.455-03	21	0	2025-12-16 07:20:58.290053-03	2025-12-16 07:20:58.321539-03	f
e68f32f1-7d10-491c-aa3b-31f4e697b172	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-10	2025-12-10 19:03:15.556-03	2025-12-10 19:03:15.556-03	1	0	2025-12-16 07:20:58.322811-03	2025-12-16 07:20:58.322811-03	f
d9a37ec5-a4f2-4f97-b537-41b707b456bc	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-10	2025-12-09 21:00:00.116-03	2025-12-10 20:50:14.971-03	50	0	2025-12-16 07:20:58.22596-03	2025-12-16 07:20:58.338291-03	f
fe80af5c-bbd1-4c19-8b84-3e67eb3f7dba	fa6e1dc009b14808	com.android.launcher3	Quickstep	2025-12-16	2025-12-16 15:58:56.315-03	2025-12-16 15:58:56.315-03	1	0	2025-12-16 15:58:54.084482-03	2025-12-16 15:58:54.084482-03	f
19281773-9a3e-49e5-aecd-6bcde60ed883	fa6e1dc009b14808	com.android.settings	Configurações	2025-12-16	2025-12-16 15:58:36.932-03	2025-12-16 16:01:15.051-03	3	0	2025-12-16 15:58:34.714492-03	2025-12-16 16:01:12.827815-03	f
a1ccb7f0-70c8-4fbd-afad-e9c8aa1f9177	fa6e1dc009b14808	com.amazon.mp3	Amazon Music	2025-12-16	2025-12-16 16:01:23.195-03	2025-12-16 16:01:23.195-03	1	0	2025-12-16 16:01:21.127463-03	2025-12-16 16:01:21.127463-03	f
5ae7f7a8-a8dc-40a8-8b10-2c82845bdb8a	fa6e1dc009b14808	com.google.android.permissioncontroller	Controlador de permissões	2025-12-16	2025-12-16 16:01:35.442-03	2025-12-16 16:01:35.442-03	1	0	2025-12-16 16:01:33.302009-03	2025-12-16 16:01:33.302009-03	f
396aca81-da8c-4a32-99c2-590b710ea9dd	fa6e1dc009b14808	com.android.launcher3	Quickstep	2025-12-17	2025-12-17 06:22:39.185-03	2025-12-17 06:22:39.185-03	1	0	2025-12-17 06:22:38.809534-03	2025-12-17 06:22:38.809534-03	f
0f57b375-678b-4065-a8d7-894bcdd6e250	16cb9c484de07dfb	com.amazon.mShop.android.shopping	Amazon Shopping	2025-12-17	2025-12-17 13:33:53.381-03	2025-12-17 13:33:53.381-03	1	0	2025-12-17 13:33:53.553278-03	2025-12-17 13:33:53.553278-03	f
9fa2a4d7-0e55-4168-8ee6-9dbb547f4498	9683ba8f5197ec9e	com.google.android.youtube	YouTube	2025-12-18	2025-12-18 09:10:41.641-03	2025-12-18 12:05:12.37-03	2	0	2025-12-18 09:10:40.866909-03	2025-12-18 12:05:10.469524-03	t
d49d3884-0b1d-48b1-a357-5e878e5359aa	d76c64d820c5509b	com.google.android.apps.messaging	Mensagens	2025-12-11	2025-12-11 15:27:15.03-03	2025-12-11 16:13:03.532-03	4	0	2025-12-16 07:20:58.452308-03	2025-12-16 07:20:58.456911-03	f
7df42d9b-579b-4939-ab2f-a6faf9af5d49	d76c64d820c5509b	com.google.android.googlequicksearchbox	Google	2025-12-11	2025-12-11 16:28:39.8-03	2025-12-11 16:41:54.141-03	2	0	2025-12-16 07:20:58.458236-03	2025-12-16 07:20:58.460471-03	f
32cf4c9e-4868-4aaf-a9c5-cbd902219fe6	9683ba8f5197ec9e	com.google.android.googlequicksearchbox	Google	2025-12-23	2025-12-23 07:33:20.137-03	2025-12-23 11:04:19.254-03	29	0	2025-12-23 07:33:20.63582-03	2025-12-24 07:10:57.311007-03	f
56801d75-5913-4ce0-8f33-8c82f070d111	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-11	2025-12-11 16:41:57.233-03	2025-12-11 20:42:24.401-03	22	0	2025-12-16 07:20:58.4619-03	2025-12-16 07:20:58.493452-03	f
354a52c4-93e0-469c-9dca-76ae5879abda	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-11	2025-12-10 21:00:00.565-03	2025-12-11 20:52:36.682-03	89	0	2025-12-16 07:20:58.33937-03	2025-12-16 07:20:58.497812-03	f
a3b39a76-22e3-4581-9f3d-4f595121034a	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-12	2025-12-11 21:00:00.839-03	2025-12-12 08:10:59.376-03	64	0	2025-12-16 07:20:58.49921-03	2025-12-16 07:20:58.586896-03	f
2ecefea4-e640-4866-9d6d-6d362b2f4d84	d76c64d820c5509b	com.google.android.apps.messaging	Mensagens	2025-12-13	2025-12-13 15:52:00.519-03	2025-12-13 16:00:00.192-03	2	0	2025-12-16 07:20:58.588018-03	2025-12-16 07:20:58.590228-03	f
bcad3e90-58e8-4c4a-8b33-ba857e5afe63	d76c64d820c5509b	com.google.android.googlequicksearchbox	Google	2025-12-13	2025-12-13 16:15:00.725-03	2025-12-13 18:31:44.8-03	9	0	2025-12-16 07:20:58.591498-03	2025-12-16 07:20:58.604146-03	f
af98a049-1301-4876-ad13-7e884339919d	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-13	2025-12-13 18:31:48.944-03	2025-12-13 18:31:48.944-03	1	0	2025-12-16 07:20:58.605296-03	2025-12-16 07:20:58.605296-03	f
cdc0e542-7205-497e-a20b-39c09c104d19	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-13	2025-12-13 18:31:54.054-03	2025-12-13 20:40:58.777-03	11	0	2025-12-16 07:20:58.607328-03	2025-12-16 07:20:58.620747-03	f
5166f5e5-176b-4170-b05a-0592c779373e	d76c64d820c5509b	com.google.android.apps.messaging	Mensagens	2025-12-14	2025-12-14 16:00:01.37-03	2025-12-14 18:35:00.495-03	9	0	2025-12-16 07:20:58.749806-03	2025-12-16 07:20:58.761066-03	f
16cef85d-04f9-47bc-a0d6-0b4f5084b4f4	d76c64d820c5509b	com.heytap.pictorial	Magazine da tela bloqueada	2025-12-14	2025-12-14 18:40:31.974-03	2025-12-14 18:40:31.974-03	1	0	2025-12-16 07:20:58.762661-03	2025-12-16 07:20:58.762661-03	f
331cacce-3f78-42b5-afe6-4b7d84a07ed9	d76c64d820c5509b	com.google.android.ext.services	Android Services Library	2025-12-14	2025-12-14 18:40:35.066-03	2025-12-14 18:40:35.066-03	1	0	2025-12-16 07:20:58.765047-03	2025-12-16 07:20:58.765047-03	f
09e5110a-edce-4e82-b45e-9d1148ea23ed	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-14	2025-12-13 21:00:00.815-03	2025-12-14 20:55:01.257-03	98	0	2025-12-16 07:20:58.622094-03	2025-12-16 07:20:58.777764-03	f
9011b8c0-4f5d-44c7-8134-2caafe9ea626	9683ba8f5197ec9e	com.google.android.apps.messaging	Mensagens	2025-12-24	2025-12-24 07:10:56.804-03	2025-12-24 07:39:53-03	5	0	2025-12-24 07:10:57.312368-03	2025-12-24 07:51:14.547552-03	f
c31e794c-071e-43bc-ac51-74247b6fbe34	7481835c934f771a	com.android.launcher3	Quickstep	2025-12-17	2025-12-17 07:53:52.513-03	2025-12-17 07:58:45.082-03	2	0	2025-12-17 07:53:52.278541-03	2025-12-17 07:58:45.221136-03	f
26f8c16b-5fbc-4200-abf8-8d2bd7e774ed	d76c64d820c5509b	com.google.android.networkstack.tethering	Tethering	2025-12-15	2025-12-14 21:00:00.519-03	2025-12-15 06:11:58.664-03	39	0	2025-12-16 07:20:58.778938-03	2025-12-16 07:20:58.844005-03	f
3f481bf5-d4b1-4363-b862-a04ac1719b17	fa7a2953dda27a79	com.google.android.youtube	YouTube	2025-12-17	2025-12-17 13:59:23.15-03	2025-12-17 13:59:23.15-03	1	0	2025-12-17 13:59:22.928703-03	2025-12-17 13:59:22.928703-03	t
cc317452-e18f-4b4f-b3bc-6ca0b5eb1cb0	d76c64d820c5509b	com.android.settings	Configurações	2025-12-15	2025-12-15 06:40:08.992-03	2025-12-15 06:43:26.477-03	4	0	2025-12-16 07:20:58.845215-03	2025-12-16 07:20:58.85026-03	f
9d349af8-9508-418b-bcfd-f87381c689de	d76c64d820c5509b	com.heytap.market	App Market	2025-12-15	2025-12-15 06:43:35.658-03	2025-12-15 06:43:35.658-03	1	0	2025-12-16 07:20:58.851559-03	2025-12-16 07:20:58.851559-03	f
729eb67f-b28d-4067-a7ad-8409c6acf77a	fa7a2953dda27a79	com.android.launcher3	Quickstep	2025-12-17	2025-12-17 13:56:33.472-03	2025-12-17 14:39:38.972-03	3	0	2025-12-17 13:57:41.573115-03	2025-12-17 14:39:38.731091-03	f
2d2812d9-7952-41f8-a671-ba8f23e3a732	d76c64d820c5509b	com.android.launcher3	Quickstep	2025-12-15	2025-12-15 06:43:39.773-03	2025-12-15 06:43:39.773-03	1	0	2025-12-16 07:20:58.853457-03	2025-12-16 07:20:58.853457-03	f
0eae1cd2-fb16-4c6c-b7c5-599b7aa3eee8	d76c64d820c5509b	com.android.settings	Configurações	2025-12-16	2025-12-16 07:20:58.497-03	2025-12-16 07:20:58.497-03	1	0	2025-12-16 07:20:58.855467-03	2025-12-16 07:20:58.855467-03	f
85c8fe5a-adb5-4382-bb91-d103af5c8163	fa7a2953dda27a79	com.android.settings	Configurações	2025-12-17	2025-12-17 13:57:41.746-03	2025-12-17 15:59:22.7-03	6	0	2025-12-17 13:57:41.57999-03	2025-12-17 15:59:22.434402-03	f
e79d2eb9-707d-41c1-b7c6-73a162aed32b	9683ba8f5197ec9e	com.android.chrome	Chrome	2025-12-18	2025-12-18 12:01:28.684-03	2025-12-18 12:01:28.684-03	1	0	2025-12-18 12:05:10.464495-03	2025-12-18 12:05:10.464495-03	f
\.


--
-- Data for Name: app_policies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_policies (id, organization_id, group_id, package_name, app_name, policy_type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: applocker_allowed_programs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.applocker_allowed_programs (id, computer_id, name, path, publisher, product_name, hash, rule_type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: applocker_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.applocker_config (id, computer_id, enabled, mode, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, admin_username, action, target_resource, details, ip_address, created_at) FROM stdin;
a34bb677-a5e9-46b5-960d-58ad09731f95	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 11:28:34.585345-03
e1dfff0b-7ef7-4260-82f4-b0c47bec8721	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 13:24:43.003824-03
fcdd33bb-ac2a-4acd-a4d7-aa4938e21c43	admin	CREATE_USER	teste	Criou usuário com permissão: user	::1	2025-12-15 13:31:31.828435-03
8ee00e70-809d-4e81-a054-f108e69fedfa	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 13:31:49.570147-03
d6eb7b90-89a7-4e29-ad77-bda8994f8ff8	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 13:34:29.346856-03
dfcfa166-2b21-491d-a7c0-46ba26fdc09d	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 13:40:26.262443-03
2533ba2e-86cc-4d7d-8cd0-f9809d8a9579	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 13:44:51.440832-03
a59acc5c-e6ca-47d8-b33d-63140a9b9a23	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 13:48:13.690513-03
aeeaf141-dacc-4c56-823e-aae45a1bfa13	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 13:54:31.624498-03
b2bdbeea-6fbc-4bd6-981a-599e4d9c27d8	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 14:08:05.608091-03
c679719a-f2bb-45c2-9e98-1d3fc4400508	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 14:08:38.868642-03
ff37f27e-6422-4987-b38f-66708f2229d3	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 14:12:29.418645-03
bb1fb723-791a-4d97-a37d-e695161eebb2	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 14:13:27.28414-03
290ebc5d-2ad9-4de7-ac1e-f4ce6df0d33a	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 14:25:59.782793-03
daf7f088-d2df-4d54-b68c-e56d997b32bb	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 14:26:32.058253-03
d88a8354-8e7c-496a-afbd-a59c42eea009	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 14:35:43.806623-03
923a10f1-3e9c-4c4a-bb75-6f39a18d71ae	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 14:36:10.100881-03
5507acc2-5b89-48f3-a9e6-754a5f607ffa	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 15:06:12.052347-03
235384d6-81ab-46c1-ad12-27cc55ea5c2b	teste	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 15:06:32.568688-03
8e403208-ab20-4a85-a09b-d0148149bd21	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 15:26:56.92632-03
1d27d922-9d03-4444-96aa-ce2caaa6b07e	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-15 15:34:33.457434-03
6f504819-f2c0-4b3e-8564-f60f34aba8fd	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-16 06:54:35.456981-03
e66e61e1-1610-40cf-8a62-714cc559e0b4	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-17 06:54:59.896823-03
5bcc6c6f-5cc2-4a45-a271-4d98f195af5a	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-17 15:01:22.523919-03
e1dd5591-74af-45a3-b4ba-7e5676a5d78a	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-17 16:13:52.145995-03
04785c8f-3e70-44a6-9601-ed200c353815	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-17 16:13:53.947407-03
b3624135-e1be-4aa4-8773-a7a9389b6fb7	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-19 07:09:03.275117-03
4edbbd32-9cc9-4c74-a4b0-080ad48aebb6	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-22 06:26:43.04659-03
47ffb8cf-b051-4986-92a8-2a347d275f22	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-22 06:26:47.838463-03
62b7960a-dca8-4695-9fe8-351bd1e36bac	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-23 06:42:43.186938-03
f09ce913-52ee-47e4-a510-7be2b5f27c97	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-24 07:04:20.027707-03
82e0448e-3e83-49fc-9d50-64403b7804e8	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-26 06:10:17.024194-03
c162b8e6-1b97-4fbe-abbd-738af7fd3f48	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-29 06:15:57.985023-03
4260e52e-1882-4c26-b616-08372f683d6e	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-30 06:22:33.429017-03
cc554c6a-ea6a-423c-acad-8e6db5ca85fa	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-31 06:32:38.138454-03
f4e6414a-3893-468c-b491-904e83055a24	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2025-12-31 06:32:44.78442-03
f702466b-e99c-4009-bf1b-6d8091ae9966	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2026-01-05 06:32:13.75626-03
fe907350-3a85-4004-bf8a-a2ac69a6a662	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2026-01-06 06:47:04.047729-03
68ff7e78-283d-442f-9e47-1887b351599f	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2026-01-07 07:16:52.452255-03
bb4db2af-6685-46d2-887a-542b390ace36	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2026-01-08 07:19:24.411002-03
cf14d18e-dc05-415d-ae6c-edc064ffb941	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2026-01-14 14:37:45.930741-03
bab1b9f3-f36f-4f72-8f03-b1bdac835c33	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2026-01-14 14:37:49.341171-03
d33f6450-e899-4c4e-880f-0461655ef871	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2026-01-14 15:15:44.70085-03
77968b88-4756-4bc1-aae5-ba8947826c42	admin	LOGIN	Sistema	Login realizado com sucesso	::1	2026-01-14 15:15:46.824397-03
\.


--
-- Data for Name: computer_group_memberships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_group_memberships (id, computer_id, group_id, assigned_by, assigned_at) FROM stdin;
\.


--
-- Data for Name: computer_installed_programs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_installed_programs (id, computer_id, name, version, publisher, install_date, install_location, size, created_at, updated_at) FROM stdin;
e7a2e6ce-6b8c-48b9-a4ca-4a3c246e2618	df504f2f-7059-4bc2-af90-0584c559138f	vcpp_crt.redist.clickonce	14.29.30157	Microsoft Corporation	2025-08-03 21:00:00-03	\N	4096	2026-03-10 08:48:54.067717-03	2026-03-10 08:48:54.074626-03
bd9db9af-2fea-4933-834a-0987d22fbcf7	df504f2f-7059-4bc2-af90-0584c559138f	Windows Mobile Extension SDK Contracts	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.074518-03	2026-03-10 08:48:54.090806-03
31a19367-790c-4e3a-a579-aafca21fb753	df504f2f-7059-4bc2-af90-0584c559138f	VS Immersive Activate Helper	17.0.157.0	Microsoft Corporation	2025-11-03 21:00:00-03	\N	91136	2026-03-10 08:48:54.05279-03	2026-03-10 08:48:54.090949-03
8367f394-3774-47b7-900e-990a0bda22f0	df504f2f-7059-4bc2-af90-0584c559138f	vs_minshellmsi	16.11.34902	Microsoft Corporation	2025-11-03 21:00:00-03	\N	139264	2026-03-10 08:48:54.064341-03	2026-03-10 08:48:54.09249-03
d2baa660-dd43-4b05-ae9e-b8834ddc5ace	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Workload.Emscripten.Current.Manifest (x64)	72.48.40820	Microsoft Corporation	2025-11-04 21:00:00-03	\N	647168	2026-03-10 08:48:54.065983-03	2026-03-10 08:48:54.096152-03
aa781ffb-a0a6-469c-a544-7a7b605212b8	df504f2f-7059-4bc2-af90-0584c559138f	vs_minshellinteropx64msi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	73728	2026-03-10 08:48:54.063155-03	2026-03-10 08:48:54.097446-03
be969641-47fc-4341-8d97-80df9d94652b	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Windows Desktop Targeting Pack - 9.0.10 (x64)	72.40.40921	Microsoft Corporation	2025-11-04 21:00:00-03	\N	29577216	2026-03-10 08:48:54.061105-03	2026-03-10 08:48:54.106549-03
68e2e4a6-0028-4ef2-968e-c5735e0ac172	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Workload.Emscripten.net6.Manifest (x64)	72.48.40820	Microsoft Corporation	2025-11-04 21:00:00-03	\N	647168	2026-03-10 08:48:54.078379-03	2026-03-10 08:48:54.111245-03
bde25f45-4698-44bd-8a3c-3069e6756c88	df504f2f-7059-4bc2-af90-0584c559138f	Intelbras SIM Next 1.18.26	1.18.26	Intelbras	2025-07-30 21:00:00-03	C:\\Program Files\\Intelbras\\SIMNext\\	259565568	2026-03-10 08:48:54.05482-03	2026-03-10 08:48:54.136428-03
a112fc6b-19c9-4984-ad22-f383de8a8e1d	df504f2f-7059-4bc2-af90-0584c559138f	Logi Options+	2.0.840907	Logitech	\N	\N	\N	2026-03-10 08:48:54.067863-03	2026-03-10 08:48:54.15941-03
85f951e4-dc7e-4378-98a6-80a5be24d3d1	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Workload.Mono.Toolchain.Current.Manifest (x64)	72.0.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	81920	2026-03-10 08:48:54.084189-03	2026-03-10 08:48:54.164365-03
d453668a-b4d4-46c6-8d7c-485b28a05c64	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Apps Headers	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	264245248	2026-03-10 08:48:54.062668-03	2026-03-10 08:48:54.183492-03
0212321f-dde0-40f6-9886-26be252b70ec	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 Add to Path (64-bit)	3.13.5150.0	Python Software Foundation	2025-07-24 21:00:00-03	\N	53248	2026-03-10 08:48:54.07096-03	2026-03-10 08:48:54.205502-03
e5be8473-8481-4001-b7df-999d41fcff3d	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2022 X86 Minimum Runtime - 14.50.35710	14.50.35710	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2068480	2026-03-10 08:48:54.08377-03	2026-03-10 08:48:54.216742-03
d43ddfec-7e1a-42ba-9b37-8a56745987e0	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Apps Contracts	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	14151680	2026-03-10 08:48:54.081244-03	2026-03-10 08:48:54.22355-03
440cf4a5-210d-4aeb-a1fd-e62858624702	df504f2f-7059-4bc2-af90-0584c559138f	AnyDesk	ad 9.6.9	AnyDesk Software GmbH	\N	"C:\\Program Files (x86)\\AnyDesk"	2097152	2026-03-10 08:48:54.079391-03	2026-03-10 08:48:54.228734-03
e86c3b25-5034-44f5-b7c9-2e091a356644	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14 Native 2012 SDK	3.14.8722	.NET Foundation	2025-11-05 21:00:00-03	\N	17543168	2026-03-10 08:48:54.053414-03	2026-03-10 08:48:54.252348-03
e595777e-ff48-4a94-b85c-eb4d9d846aad	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Targeting Pack - 9.0.10 (x64)	72.40.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	41947136	2026-03-10 08:48:54.069458-03	2026-03-10 08:48:54.254749-03
fb1c9fd0-d562-4130-9e3b-62b07c2b8af0	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14 Native 2013 SDK	3.14.8722	.NET Foundation	2025-11-05 21:00:00-03	\N	17702912	2026-03-10 08:48:54.06622-03	2026-03-10 08:48:54.284784-03
b78b066d-0ae5-4170-ab8c-defd08320a9a	df504f2f-7059-4bc2-af90-0584c559138f	vs_filehandler_x86	18.0.11121	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2088960	2026-03-10 08:48:54.056886-03	2026-03-10 08:48:54.291222-03
255d70d1-b16f-43b7-8f3c-66d49ab9f5ed	df504f2f-7059-4bc2-af90-0584c559138f	SDK ARM64 Additions	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.061281-03	2026-03-10 08:48:54.328787-03
0ea33321-abf3-44dc-a147-27c8fc16f13d	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Windows Desktop Runtime - 6.0.36 (x64)	48.144.23186	Microsoft Corporation	2025-12-09 21:00:00-03	\N	90951680	2026-03-10 08:48:54.072675-03	2026-03-10 08:48:54.345125-03
7cf732e9-d635-4aaf-85d2-4fa32f8c823f	df504f2f-7059-4bc2-af90-0584c559138f	vs_githubprotocolhandlermsi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	4210688	2026-03-10 08:48:54.058925-03	2026-03-10 08:48:54.378618-03
11ddee91-30bb-47d0-a3e1-2a507330ff2b	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft System CLR Types para SQL Server 2019	15.0.2000.5	Microsoft Corporation	2025-11-03 21:00:00-03	\N	3977216	2026-03-10 08:48:54.07258-03	2026-03-10 08:48:54.396561-03
0f0c125d-3146-49ec-a2fe-6f88deb0f050	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2022 X86 Debug Runtime - 14.50.35710	14.50.35710	Microsoft Corporation	2025-11-03 21:00:00-03	\N	25593856	2026-03-10 08:48:54.08274-03	2026-03-10 08:48:54.403532-03
ac38a4d3-55de-48d9-8418-4920e4c6ea3a	df504f2f-7059-4bc2-af90-0584c559138f	icecap_collection_x64	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1913856	2026-03-10 08:48:54.054984-03	2026-03-10 08:48:54.405971-03
c0377713-3503-48a7-9486-c18f7ee25199	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft ASP.NET Core 9.0.10 Shared Framework (x64)	9.0.10.25475	Microsoft Corporation	2025-11-04 21:00:00-03	\N	29208576	2026-03-10 08:48:54.056843-03	2026-03-10 08:48:54.43214-03
d7d7eb8d-3b34-422e-86d7-656d74cb432a	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual Studio Setup WMI Provider	4.0.2113.32518	Microsoft Corporation	2025-11-03 21:00:00-03	\N	4964352	2026-03-10 08:48:54.076512-03	2026-03-10 08:48:54.46168-03
3ff7f0b8-dd34-47a3-8638-ab5969b289b6	df504f2f-7059-4bc2-af90-0584c559138f	vs_minshellsharedmsi	18.0.11121	Microsoft Corporation	2025-11-03 21:00:00-03	\N	278528	2026-03-10 08:48:54.069281-03	2026-03-10 08:48:54.464256-03
7eafa928-389c-4025-828a-d18028ea6515	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Modern Versioned Developer Tools	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	7901184	2026-03-10 08:48:54.077967-03	2026-03-10 08:48:54.467606-03
704963d5-759d-4497-b40d-63e4895bb40e	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Workload.Mono.Toolchain.net8.Manifest (x64)	72.0.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	57344	2026-03-10 08:48:54.079748-03	2026-03-10 08:48:54.473495-03
e99fc92c-9018-4758-8c95-90ce1af6c799	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Apps Libs	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	188915712	2026-03-10 08:48:54.076876-03	2026-03-10 08:48:54.478324-03
d103c4c5-e039-49a7-bd57-74d4d9ace0d4	df504f2f-7059-4bc2-af90-0584c559138f	vs_minshellmsires	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	147456	2026-03-10 08:48:54.064839-03	2026-03-10 08:48:54.4922-03
9c5f1d3a-e322-4c93-8f3a-8778269d7691	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Windows Desktop Runtime - 8.0.18 (x64)	64.72.35986	Microsoft Corporation	2025-07-30 21:00:00-03	\N	94310400	2026-03-10 08:48:54.08527-03	2026-03-10 08:48:54.502877-03
6d3c4602-8ec3-4553-9b7d-4fc76e1a1427	df504f2f-7059-4bc2-af90-0584c559138f	Adobe Refresh Manager	1.8.0	Adobe Systems Incorporated	2026-02-11 21:00:00-03	C:\\Program Files (x86)\\Common Files\\Adobe\\ARM\\1.0\\	2154496	2026-03-10 08:48:54.051669-03	2026-03-10 08:48:54.504277-03
cd9abebe-f592-41da-ad3d-dd0aa18b26f2	df504f2f-7059-4bc2-af90-0584c559138f	Windows Software Development Kit - Windows 10.0.19041.5609	10.1.19041.5609	Microsoft Corporation	\N	\N	2010299392	2026-03-10 08:48:54.059019-03	2026-03-10 08:48:54.514252-03
94a3164d-6c53-4149-869f-16c91afce4e9	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2022 X64 Additional Runtime - 14.50.35710	14.50.35710	Microsoft Corporation	2025-11-03 21:00:00-03	\N	12148736	2026-03-10 08:48:54.080802-03	2026-03-10 08:48:54.520424-03
6a4df009-b3df-47d3-a818-8e51044de272	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14 Managed SDK	3.14.8722	.NET Foundation	2025-11-05 21:00:00-03	\N	4136960	2026-03-10 08:48:54.070803-03	2026-03-10 08:48:54.53253-03
dc4762ea-2fe4-4998-b687-831926b295cd	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 Tcl/Tk Support (64-bit)	3.13.5150.0	Python Software Foundation	2025-07-24 21:00:00-03	\N	14217216	2026-03-10 08:48:54.082217-03	2026-03-10 08:48:54.533646-03
d7b7cf0f-8778-4242-a18b-256789ddc120	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft 365 Apps para Grandes Empresas - pt-br	16.0.19725.20126	Microsoft Corporation	\N	C:\\Program Files\\Microsoft Office	\N	2026-03-10 08:48:54.094379-03	2026-03-10 08:48:54.103886-03
3bacc535-3838-45fe-834b-a45d7cee5ebb	df504f2f-7059-4bc2-af90-0584c559138f	OpenUEM Agent 0.9.0	0.9.0	Miguel Angel Alvarez Cabrerizo	2025-11-13 21:00:00-03	C:\\Program Files\\OpenUEM Agent\\	88500224	2026-03-10 08:48:54.104282-03	2026-03-10 08:48:54.109788-03
1c69e2d4-7b66-4835-a622-a6d19a6feb6d	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Apps Tools	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	240762880	2026-03-10 08:48:54.100836-03	2026-03-10 08:48:54.117493-03
d8fda496-d3b0-44b1-8cc1-a6e45db4f77d	df504f2f-7059-4bc2-af90-0584c559138f	Universal General MIDI DLS Extension SDK	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	3129344	2026-03-10 08:48:54.125436-03	2026-03-10 08:48:54.129865-03
78227bdf-6494-40a1-ae3d-8eaaf987788a	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Managed Apps Libs	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	5685248	2026-03-10 08:48:54.134251-03	2026-03-10 08:48:54.134251-03
ca5b944c-4e33-45b7-b396-7392ae22aee7	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2022 X64 Minimum Runtime - 14.50.35710	14.50.35710	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2441216	2026-03-10 08:48:54.140461-03	2026-03-10 08:48:54.145306-03
679c1d01-d4c0-4b9f-b88b-2c0cf78528eb	df504f2f-7059-4bc2-af90-0584c559138f	vs_vswebprotocolselectormsi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	917504	2026-03-10 08:48:54.132023-03	2026-03-10 08:48:54.151503-03
9391422f-ffd5-4fd4-a17c-696e424db735	df504f2f-7059-4bc2-af90-0584c559138f	Windows App Certification Kit SupportedApiList x86	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2584576	2026-03-10 08:48:54.111402-03	2026-03-10 08:48:54.157565-03
6f9506c0-7a4d-4270-a9b3-2747a2eb9d0f	df504f2f-7059-4bc2-af90-0584c559138f	vs_minshellx64msi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	4096	2026-03-10 08:48:54.11572-03	2026-03-10 08:48:54.162457-03
7c015c0d-f6ba-4f7b-84fc-8861e8734f5f	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK OnecoreUap Headers arm64	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	131072	2026-03-10 08:48:54.157456-03	2026-03-10 08:48:54.165984-03
6e929730-8b51-43bb-a1ff-e1ee4bcc10cf	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 Development Libraries (64-bit)	3.13.5150.0	Python Software Foundation	2025-07-24 21:00:00-03	\N	2899968	2026-03-10 08:48:54.162574-03	2026-03-10 08:48:54.178271-03
fee2cba5-b8e9-40bf-a148-0b80a790bc6f	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Redistributables	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	4743168	2026-03-10 08:48:54.13006-03	2026-03-10 08:48:54.197718-03
fc0eceb0-1118-475a-9323-7b5a96e28ccc	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK OnecoreUap Headers x86	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	6918144	2026-03-10 08:48:54.098957-03	2026-03-10 08:48:54.200749-03
4d87258c-59ca-4418-b849-670221052356	df504f2f-7059-4bc2-af90-0584c559138f	Windows Desktop Extension SDK	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	53248	2026-03-10 08:48:54.151834-03	2026-03-10 08:48:54.209445-03
860d95f7-c7ee-48fe-b79a-058fc43bd275	df504f2f-7059-4bc2-af90-0584c559138f	vs_Graphics_Singletonx86	18.0.11104	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2956288	2026-03-10 08:48:54.123578-03	2026-03-10 08:48:54.213412-03
e7d1f13e-f42d-4f8c-ad4a-92d28087fad1	df504f2f-7059-4bc2-af90-0584c559138f	vs_vswebprotocolselectormsires	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	69632	2026-03-10 08:48:54.172701-03	2026-03-10 08:48:54.216844-03
08a0c342-a0e3-402f-acf7-09d688217e9b	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET AppHost Pack - 9.0.10 (x64_arm64)	72.40.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	12955648	2026-03-10 08:48:54.085571-03	2026-03-10 08:48:54.21866-03
43f6f28a-73b6-4aae-8b5d-a3af6a4dc8c1	df504f2f-7059-4bc2-af90-0584c559138f	vs_devenvsharedmsi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	204800	2026-03-10 08:48:54.102469-03	2026-03-10 08:48:54.228601-03
90208521-5829-434f-b6dc-0cf79a5823f0	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 pip Bootstrap (64-bit)	3.13.5150.0	Python Software Foundation	2025-07-24 21:00:00-03	\N	294912	2026-03-10 08:48:54.142056-03	2026-03-10 08:48:54.232658-03
25903ae4-c1e9-494d-9071-997b93d9f492	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK ARM64 Desktop Tools	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	249856	2026-03-10 08:48:54.178132-03	2026-03-10 08:48:54.236806-03
37e1c9b4-1c59-4f73-8d5c-cc883aa4abfb	df504f2f-7059-4bc2-af90-0584c559138f	vs_Graphics_Singletonx64	18.0.11104	Microsoft Corporation	2025-11-03 21:00:00-03	\N	3167232	2026-03-10 08:48:54.143661-03	2026-03-10 08:48:54.244766-03
eb62a1b7-065f-4ab0-ac4f-fb6265aad9c8	df504f2f-7059-4bc2-af90-0584c559138f	vs_devenx64vmsi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	208896	2026-03-10 08:48:54.127962-03	2026-03-10 08:48:54.249573-03
746177f5-6ad4-45e3-a252-ada8cfdfe7bc	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Tools x86	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	17965056	2026-03-10 08:48:54.088682-03	2026-03-10 08:48:54.258368-03
d4dfaf7a-ef55-4775-80ad-f093ee0fda60	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Signing Tools	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	11411456	2026-03-10 08:48:54.108523-03	2026-03-10 08:48:54.260039-03
8850eb2e-2503-472d-9634-383b3a0ac5a5	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Sdk.MacCatalyst.Manifest-9.0.100 (x64)	18.0.9617	Microsoft Corporation	2025-11-04 21:00:00-03	\N	724992	2026-03-10 08:48:54.166155-03	2026-03-10 08:48:54.268363-03
f5580531-32ea-48cc-b3d4-8c849b34b262	df504f2f-7059-4bc2-af90-0584c559138f	Visual Studio Community 2026 Insiders	Insiders [11201.2]	Microsoft Corporation	2025-11-03 21:00:00-03	C:\\Program Files\\Microsoft Visual Studio\\18\\Insiders	\N	2026-03-10 08:48:54.112908-03	2026-03-10 08:48:54.270322-03
b5ffd4ab-5006-4e73-9045-bf1b2b5a607f	df504f2f-7059-4bc2-af90-0584c559138f	Windows Team Extension SDK	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	172032	2026-03-10 08:48:54.136283-03	2026-03-10 08:48:54.272009-03
bf17d5df-69ac-402c-b83e-22fa94c8a6eb	df504f2f-7059-4bc2-af90-0584c559138f	Application Verifier x64 External Package (OnecoreUAP)	10.1.26100.6901	Microsoft	2025-11-03 21:00:00-03	\N	5820416	2026-03-10 08:48:54.17499-03	2026-03-10 08:48:54.274355-03
79b7b895-49eb-4a4d-9ba0-73a43cfef5f4	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Sdk.tvOS.Manifest-9.0.100 (x64)	18.0.9617	Microsoft Corporation	2025-11-04 21:00:00-03	\N	724992	2026-03-10 08:48:54.169441-03	2026-03-10 08:48:54.303898-03
73af478c-3ac4-4274-ad1e-6a0b88f7de5b	df504f2f-7059-4bc2-af90-0584c559138f	Windows Desktop Extension SDK Contracts	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	528384	2026-03-10 08:48:54.155457-03	2026-03-10 08:48:54.311575-03
906c5a70-4297-48d3-b238-d1a9dcf2cb22	df504f2f-7059-4bc2-af90-0584c559138f	Windows App Certification Kit Native Components	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	8839168	2026-03-10 08:48:54.159286-03	2026-03-10 08:48:54.319499-03
49de0946-0eec-4eca-89d4-7f20e0554955	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense IoT - en-us	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.185867-03	2026-03-10 08:48:54.330792-03
b5eae6b0-e008-48f6-b758-161962a861a1	df504f2f-7059-4bc2-af90-0584c559138f	Windows IoT Extension SDK Contracts	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.171095-03	2026-03-10 08:48:54.334997-03
684854ec-d94e-4d67-b552-7dbc2e56985b	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Libs arm64	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	141201408	2026-03-10 08:48:54.119566-03	2026-03-10 08:48:54.346883-03
94179c8b-bbde-4828-9136-538acfa2bfeb	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense IoT - Other Languages	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.121898-03	2026-03-10 08:48:54.358757-03
4308f78c-0e9a-41df-ab06-b74cb90a2f02	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14 Native 2017 SDK	3.14.8722	.NET Foundation	2025-11-05 21:00:00-03	\N	29999104	2026-03-10 08:48:54.179817-03	2026-03-10 08:48:54.367912-03
b8c846f0-3149-4342-8d22-c6f2c52bd881	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 Core Interpreter (64-bit)	3.13.5150.0	Python Software Foundation	2025-08-03 21:00:00-03	\N	6168576	2026-03-10 08:48:54.16779-03	2026-03-10 08:48:54.38034-03
f7080ea7-a7e6-4364-a50b-3dc08f169715	df504f2f-7059-4bc2-af90-0584c559138f	icecap_collection_neutral	18.0.11104	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1761280	2026-03-10 08:48:54.164561-03	2026-03-10 08:48:54.392346-03
8e378d2f-e654-4d2e-bbdb-badc2e6e6990	df504f2f-7059-4bc2-af90-0584c559138f	Windows Subsystem for Linux	2.6.1.0	Microsoft Corporation	2025-09-18 21:00:00-03	\N	879489024	2026-03-10 08:48:54.149791-03	2026-03-10 08:48:54.425495-03
211c4767-b8ff-4541-acbc-a526d66c12fd	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense Mobile - en-us	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	192512	2026-03-10 08:48:54.145194-03	2026-03-10 08:48:54.45089-03
0c138947-5a6a-414d-8dbb-d3670513b1f6	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2013 x64 Minimum Runtime - 12.0.40664	12.0.40664	Microsoft Corporation	2025-10-01 21:00:00-03	\N	2584576	2026-03-10 08:48:54.147477-03	2026-03-10 08:48:54.494181-03
2e929dcc-2593-4701-80ad-4ce326d9f374	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Host - 8.0.18 (x64)	64.72.35889	Microsoft Corporation	2025-07-30 21:00:00-03	\N	520192	2026-03-10 08:48:54.086925-03	2026-03-10 08:48:54.504493-03
f2aa7027-c8e8-44d7-9bfe-e5fe8d0f4415	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 Standard Library (64-bit)	3.13.5150.0	Python Software Foundation	2025-07-24 21:00:00-03	\N	24031232	2026-03-10 08:48:54.17669-03	2026-03-10 08:48:54.50575-03
729476c8-3f65-47c4-98a3-706ff1753b9e	df504f2f-7059-4bc2-af90-0584c559138f	UEM Agent	1.0.0	UEM	2026-01-07 21:00:00-03	\N	8159232	2026-03-10 08:48:54.097595-03	2026-03-10 08:48:54.506889-03
76f03874-3a59-4135-8152-9d27dfa5147d	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK OnecoreUap Headers x64	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	40960	2026-03-10 08:48:54.094188-03	2026-03-10 08:48:54.109871-03
ad4f4009-8fc0-457a-b6f4-4e7f938845a7	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14 X64	3.14.8722	.NET Foundation	2025-11-05 21:00:00-03	\N	36864	2026-03-10 08:48:54.112807-03	2026-03-10 08:48:54.117467-03
caf316df-69ab-4cc0-b531-8072d16843fc	df504f2f-7059-4bc2-af90-0584c559138f	Windows App Certification Kit x64	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	81973248	2026-03-10 08:48:54.125615-03	2026-03-10 08:48:54.138167-03
3b0125f3-321a-47d9-b2da-80eeb96a38fe	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Headers arm64	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	86016	2026-03-10 08:48:54.149732-03	2026-03-10 08:48:54.153758-03
21536f42-67b8-4477-9913-9ae4d6fae708	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2022 X64 Debug Runtime - 14.50.35710	14.50.35710	Microsoft Corporation	2025-11-03 21:00:00-03	\N	31303680	2026-03-10 08:48:54.179961-03	2026-03-10 08:48:54.181368-03
157e7abf-54cd-4c67-9ec1-605d3ba289a5	df504f2f-7059-4bc2-af90-0584c559138f	DiagnosticsHub_CollectionService	18.0.36317	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1308672	2026-03-10 08:48:54.11967-03	2026-03-10 08:48:54.192733-03
5404f870-dfd9-4164-b5ca-fc635821c33c	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Host FX Resolver - 9.0.10 (x64)	72.40.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	356352	2026-03-10 08:48:54.187677-03	2026-03-10 08:48:54.194329-03
ba079d8e-9173-4fd5-963f-05f5c10b4587	df504f2f-7059-4bc2-af90-0584c559138f	WPTx64 (DesktopEditions)	10.1.26100.6901	Microsoft	2025-11-03 21:00:00-03	\N	212504576	2026-03-10 08:48:54.153575-03	2026-03-10 08:48:54.23661-03
02f06073-f4cb-4142-a2dd-1f3692136393	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2013 Redistributable (x64) - 12.0.40664	12.0.40664.0	Microsoft Corporation	\N	\N	21567488	2026-03-10 08:48:54.181508-03	2026-03-10 08:48:54.24277-03
b8215007-20b4-4299-90fa-af739dd7852a	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft OneDrive	26.026.0209.0004	Microsoft Corporation	\N	\N	494462976	2026-03-10 08:48:54.168625-03	2026-03-10 08:48:54.2545-03
2a046727-a4e7-468b-b021-f238cddf6d12	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Workload.Emscripten.net7.Manifest (x64)	72.48.40820	Microsoft Corporation	2025-11-04 21:00:00-03	\N	647168	2026-03-10 08:48:54.170109-03	2026-03-10 08:48:54.258534-03
2ec8401f-35d0-493a-899e-3ce1bbfe15a8	df504f2f-7059-4bc2-af90-0584c559138f	vs_FileTracker_Singleton	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1527808	2026-03-10 08:48:54.088942-03	2026-03-10 08:48:54.280276-03
ff017eab-604f-4afa-9c80-f25a7b4d668d	df504f2f-7059-4bc2-af90-0584c559138f	Universal CRT Tools x64	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2113536	2026-03-10 08:48:54.108339-03	2026-03-10 08:48:54.306376-03
da07af60-4bb3-49b0-a98e-5482af058e5b	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Sdk.iOS.Manifest-9.0.100 (x64)	18.0.9617	Microsoft Corporation	2025-11-04 21:00:00-03	\N	724992	2026-03-10 08:48:54.171529-03	2026-03-10 08:48:54.313377-03
a980787c-d543-4428-bfdc-a1cec91c62e3	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ v14 Redistributable (x86) - 14.50.35710	14.50.35710.0	Microsoft Corporation	\N	\N	19101696	2026-03-10 08:48:54.100622-03	2026-03-10 08:48:54.31775-03
004bba32-e47a-4bf3-907b-6c3aab883e3d	df504f2f-7059-4bc2-af90-0584c559138f	vs_filehandler_amd64	18.0.11121	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2142208	2026-03-10 08:48:54.189275-03	2026-03-10 08:48:54.319406-03
ed8a5cd5-eb5e-4c0d-b6a2-9703835bd7a5	df504f2f-7059-4bc2-af90-0584c559138f	Windows App Certification Kit x64 (OnecoreUAP)	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	6791168	2026-03-10 08:48:54.155392-03	2026-03-10 08:48:54.321169-03
f4502a58-4152-4ade-b141-bb07089605d8	df504f2f-7059-4bc2-af90-0584c559138f	WireGuard	0.5.3	WireGuard LLC	2025-09-23 21:00:00-03	\N	8327168	2026-03-10 08:48:54.192561-03	2026-03-10 08:48:54.322775-03
75593780-3e08-402a-8bce-a5755fc0c02b	df504f2f-7059-4bc2-af90-0584c559138f	vs_communityx64msi	18.0.11121	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1138688	2026-03-10 08:48:54.186005-03	2026-03-10 08:48:54.338759-03
9e87522a-5ca8-43e4-a8c4-397da49523a1	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2013 x64 Additional Runtime - 12.0.40664	12.0.40664	Microsoft Corporation	2025-10-01 21:00:00-03	\N	12066816	2026-03-10 08:48:54.143896-03	2026-03-10 08:48:54.342253-03
e55d3a6a-e746-4f71-9057-9a33806edc9a	df504f2f-7059-4bc2-af90-0584c559138f	ZebraDesigner 3	3.3.0.78	Zebra Technologies Corporation	2025-07-24 21:00:00-03	C:\\Program Files\\Zebra Technologies\\ZebraDesigner 3	221216768	2026-03-10 08:48:54.138225-03	2026-03-10 08:48:54.344586-03
61994b25-0590-432e-b6c7-4221a19c0019	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Workload.Mono.Toolchain.net6.Manifest (x64)	72.0.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	57344	2026-03-10 08:48:54.134155-03	2026-03-10 08:48:54.37529-03
ed3e125e-f0cf-4543-be55-f3b6b793cdcb	df504f2f-7059-4bc2-af90-0584c559138f	Windows IoT Extension SDK	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.176832-03	2026-03-10 08:48:54.381977-03
9ab540e7-23d0-4a6d-94a0-f1c4d96ce99d	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	3346432	2026-03-10 08:48:54.191031-03	2026-03-10 08:48:54.384231-03
60ca9637-c877-44bb-b54a-4bfb8dc4046f	df504f2f-7059-4bc2-af90-0584c559138f	Docker Desktop	4.46.0	Docker Inc.	\N	C:\\Program Files\\Docker\\Docker	2906739712	2026-03-10 08:48:54.131857-03	2026-03-10 08:48:54.386259-03
b060d022-548c-4f3f-954f-f5f090ad3483	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 Executables (64-bit)	3.13.5150.0	Python Software Foundation	2025-08-03 21:00:00-03	\N	2658304	2026-03-10 08:48:54.202737-03	2026-03-10 08:48:54.388098-03
24e4f10e-6fa5-44ca-9441-a4e5a124bff2	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Framework 4 Multi-Targeting Pack	4.0.30319	Microsoft Corporation	2025-11-03 21:00:00-03	\N	87506944	2026-03-10 08:48:54.127884-03	2026-03-10 08:48:54.392401-03
5e5e4257-65a1-4df0-9692-18e57b830196	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Sdk.macOS.Manifest-9.0.100 (x64)	15.0.9617	Microsoft Corporation	2025-11-04 21:00:00-03	\N	724992	2026-03-10 08:48:54.106355-03	2026-03-10 08:48:54.403663-03
b9be808a-2550-4306-adb8-fc620ac93ce2	df504f2f-7059-4bc2-af90-0584c559138f	Office 16 Click-to-Run Extensibility Component	16.0.19725.20014	Microsoft Corporation	2026-03-02 21:00:00-03	\N	32952320	2026-03-10 08:48:54.194217-03	2026-03-10 08:48:54.434455-03
cc9922fa-acee-4108-b278-3a1f2f0a65f1	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Workload.Mono.Toolchain.net7.Manifest (x64)	72.0.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	57344	2026-03-10 08:48:54.196002-03	2026-03-10 08:48:54.438569-03
24ba16dd-01f9-4724-83b4-b0c0fd7e00e8	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense UAP - en-us	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	13156352	2026-03-10 08:48:54.147349-03	2026-03-10 08:48:54.444782-03
72b6b308-427c-4a52-8dd2-4b13ef04641d	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Windows Desktop Runtime - 9.0.10 (x64)	72.40.40921	Microsoft Corporation	2025-11-04 21:00:00-03	\N	99254272	2026-03-10 08:48:54.086848-03	2026-03-10 08:48:54.455155-03
5362bb93-9ca5-4c53-b3e7-fdd517aa5fdf	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Sdk.Maui.Manifest-9.0.100 (x64)	9.0.0	Microsoft Corporation	2025-11-04 21:00:00-03	\N	729088	2026-03-10 08:48:54.098988-03	2026-03-10 08:48:54.486009-03
e36cf340-5df5-403a-b249-eedbe9553f72	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14 Core	3.14.8722	.NET Foundation	2025-11-05 21:00:00-03	\N	25518080	2026-03-10 08:48:54.096004-03	2026-03-10 08:48:54.505506-03
1ae9fe65-791f-4328-b3df-9bbb368d000a	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK AddOn	10.1.0.0	Microsoft Corporation	2025-11-03 21:00:00-03	\N	155648	2026-03-10 08:48:54.142188-03	2026-03-10 08:48:54.506817-03
9269796b-4032-49d3-ba35-68a3cf902f1b	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK DirectX x86 Remote	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	454656	2026-03-10 08:48:54.183625-03	2026-03-10 08:48:54.508004-03
95671bf3-4b0f-481a-8730-58941b1a1fa4	df504f2f-7059-4bc2-af90-0584c559138f	WinAppDeploy	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	937984	2026-03-10 08:48:54.123479-03	2026-03-10 08:48:54.50932-03
853ed56b-02a7-49c6-a3e0-f00c7fa04bc8	df504f2f-7059-4bc2-af90-0584c559138f	Logi Plugin Service	6.2.6.1611	Logitech	2026-02-04 21:00:00-03	\N	287836160	2026-03-10 08:48:54.11552-03	2026-03-10 08:48:54.510997-03
671fd668-b488-437d-bee4-7cf19496dfba	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Edge WebView2 Runtime	145.0.3800.97	Microsoft Corporation	2026-03-08 21:00:00-03	C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application	\N	2026-03-10 08:48:54.175227-03	2026-03-10 08:48:54.514236-03
a30e44fe-daf1-4c4d-9c15-6325eb7cdb25	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Host FX Resolver - 6.0.36 (x64)	48.144.23141	Microsoft Corporation	2025-12-09 21:00:00-03	\N	360448	2026-03-10 08:48:54.172831-03	2026-03-10 08:48:54.521535-03
bda223f0-4afb-493f-8213-9164894bcacd	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense PPI - en-us	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.092604-03	2026-03-10 08:48:54.522597-03
48a474ba-91e2-468c-989f-ae9d8bca177a	df504f2f-7059-4bc2-af90-0584c559138f	IntelliTraceProfilerProxy	15.0.21225.01	Microsoft Corporation	2025-11-03 21:00:00-03	\N	13312	2026-03-10 08:48:54.140669-03	2026-03-10 08:48:54.526323-03
34990c90-a865-49dc-876d-b3fab6701cbe	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense Desktop - Other Languages	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	7360512	2026-03-10 08:48:54.121703-03	2026-03-10 08:48:54.530684-03
7003adea-f81e-4e2d-a5fe-930efdd61c3c	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Facade Windows WinMD Versioned	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	167936	2026-03-10 08:48:54.102354-03	2026-03-10 08:48:54.531647-03
3268c105-3f43-4e19-8e0c-fe2151f9ba1b	df504f2f-7059-4bc2-af90-0584c559138f	Ubiquiti UniFi (remove only)	\N	\N	\N	\N	\N	2026-03-10 08:48:54.211018-03	2026-03-10 08:48:54.211018-03
be4b4be6-443a-4442-a971-0428dc76f1ea	df504f2f-7059-4bc2-af90-0584c559138f	Windows Mobile Extension SDK	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.214995-03	2026-03-10 08:48:54.215295-03
093eb3c8-2b4f-4996-ab0f-82a67fda8cf6	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ v14 Redistributable (x64) - 14.50.35710	14.50.35710.0	Microsoft Corporation	\N	\N	21679104	2026-03-10 08:48:54.212676-03	2026-03-10 08:48:54.264818-03
3a7b15cc-6fc2-44ff-afb6-1902078d0ff6	df504f2f-7059-4bc2-af90-0584c559138f	Windows Software Development Kit - Windows 10.0.26100.6901	10.1.26100.6901	Microsoft Corporation	\N	\N	2413242368	2026-03-10 08:48:54.223776-03	2026-03-10 08:48:54.266521-03
bbbbd814-2659-4645-a3a5-670c96c297ee	df504f2f-7059-4bc2-af90-0584c559138f	Universal CRT Extension SDK	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	6610944	2026-03-10 08:48:54.275833-03	2026-03-10 08:48:54.275833-03
350244f6-fe8c-493e-ae71-81ffa21a9cad	df504f2f-7059-4bc2-af90-0584c559138f	OBS Studio	31.1.2	OBS Project	\N	\N	\N	2026-03-10 08:48:54.218504-03	2026-03-10 08:48:54.275987-03
afdbfa68-4cd7-4b39-a859-94bda4eee707	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense Desktop - en-us	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	741376	2026-03-10 08:48:54.277584-03	2026-03-10 08:48:54.281796-03
033a9726-c484-4932-aabe-910799175ccc	df504f2f-7059-4bc2-af90-0584c559138f	Update for  (KB2504637)	1	Microsoft Corporation	\N	\N	\N	2026-03-10 08:48:54.19788-03	2026-03-10 08:48:54.286315-03
c077f921-2df5-42af-983e-e9c9ef3646e7	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14 Native 2010 SDK	3.14.8722	.NET Foundation	2025-11-05 21:00:00-03	\N	14331904	2026-03-10 08:48:54.288017-03	2026-03-10 08:48:54.288017-03
83b54f62-0cdf-4c5c-bee1-8563fd9863da	df504f2f-7059-4bc2-af90-0584c559138f	Universal CRT Headers Libraries and Sources	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	363282432	2026-03-10 08:48:54.22033-03	2026-03-10 08:48:54.289792-03
dd66e645-443c-4edd-9c85-4feee7d236d3	df504f2f-7059-4bc2-af90-0584c559138f	Python Launcher	3.13.5150.0	Python Software Foundation	2025-07-24 21:00:00-03	\N	1589248	2026-03-10 08:48:54.22191-03	2026-03-10 08:48:54.293259-03
076ea6bb-0604-43d4-8a33-cddeb14e3fad	df504f2f-7059-4bc2-af90-0584c559138f	vs_minshellinteropsharedmsi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1646592	2026-03-10 08:48:54.274104-03	2026-03-10 08:48:54.301561-03
bcbd39a3-30ad-4590-9acc-617ed137885d	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Sdk.Aspire.Manifest-8.0.100 (x64)	64.136.23253	Microsoft Corporation	2025-11-04 21:00:00-03	\N	729088	2026-03-10 08:48:54.207437-03	2026-03-10 08:48:54.310041-03
7c5cda75-b361-466d-9a2c-0514bb50f51c	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET AppHost Pack - 9.0.10 (x64_x86)	72.40.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	10940416	2026-03-10 08:48:54.260233-03	2026-03-10 08:48:54.313391-03
3d69845b-85c8-4346-9f7e-4a4568637911	df504f2f-7059-4bc2-af90-0584c559138f	vs_minshellinteropmsi	16.10.31306	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1703936	2026-03-10 08:48:54.272115-03	2026-03-10 08:48:54.316407-03
6b4c3766-9213-4504-8229-b977fe4641f6	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Libs arm	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	73207808	2026-03-10 08:48:54.266688-03	2026-03-10 08:48:54.317925-03
bb55d9a7-d49f-4ace-b42a-de78eedac368	df504f2f-7059-4bc2-af90-0584c559138f	VS Script Debugging Common	17.0.157.0	Microsoft Corporation	2025-11-03 21:00:00-03	\N	5912576	2026-03-10 08:48:54.286201-03	2026-03-10 08:48:54.32131-03
8b1ed2c1-a97d-48aa-ab9a-70320efa0b0e	df504f2f-7059-4bc2-af90-0584c559138f	Logi RightSightForWebcams 1.1.207	1.1.207.0	Logitech	2026-02-04 21:00:00-03	\N	70576128	2026-03-10 08:48:54.295643-03	2026-03-10 08:48:54.324752-03
256662a8-27bd-4743-b127-42837e525ee3	df504f2f-7059-4bc2-af90-0584c559138f	BCUninstaller 5.9.0.0	5.9.0.0	Marcin Szeniak	2025-12-09 21:00:00-03	C:\\Program Files\\BCUninstaller\\	75384832	2026-03-10 08:48:54.200999-03	2026-03-10 08:48:54.327128-03
413b4e6a-5016-4e2f-8226-791539a0268d	df504f2f-7059-4bc2-af90-0584c559138f	Eclipse Temurin JDK with Hotspot 17.0.16+8 (x64)	17.0.16.8	Eclipse Adoptium	2025-08-03 21:00:00-03	C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.16.8-hotspot\\	318205952	2026-03-10 08:48:54.205282-03	2026-03-10 08:48:54.350075-03
c194a989-5ba7-42be-a15a-51ada7b17218	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual Studio Setup Configuration	4.0.2113.32518	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1355776	2026-03-10 08:48:54.196192-03	2026-03-10 08:48:54.351444-03
c0d54c2f-ba4d-46d2-b2e7-0e512ee2c0df	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 Test Suite (64-bit)	3.13.5150.0	Python Software Foundation	2025-07-24 21:00:00-03	\N	34000896	2026-03-10 08:48:54.232836-03	2026-03-10 08:48:54.353601-03
b08523be-8ee9-4fdb-be84-fae51f37caea	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Libs x86	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	72880128	2026-03-10 08:48:54.238164-03	2026-03-10 08:48:54.355997-03
4e6ce049-14f1-4e1b-88a2-e1c0f19e6fba	df504f2f-7059-4bc2-af90-0584c559138f	Nullsoft Install System	3.11	Nullsoft and Contributors	2025-10-07 21:00:00-03	C:\\Program Files (x86)\\NSIS	\N	2026-03-10 08:48:54.231093-03	2026-03-10 08:48:54.372695-03
70936332-0270-4ad4-9d71-8a1ab1039905	df504f2f-7059-4bc2-af90-0584c559138f	vs_codecoveragemsi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	4096	2026-03-10 08:48:54.190983-03	2026-03-10 08:48:54.376702-03
35eb637e-cf36-4f92-a9f7-d07e266f6108	df504f2f-7059-4bc2-af90-0584c559138f	Office 16 Click-to-Run Localization Component	16.0.19725.20014	Microsoft Corporation	2026-03-02 21:00:00-03	\N	1089536	2026-03-10 08:48:54.247238-03	2026-03-10 08:48:54.378649-03
4854d59c-2d39-42bb-b155-229f50627c9f	df504f2f-7059-4bc2-af90-0584c559138f	Google Chrome	145.0.7632.160	Google LLC	2026-03-05 21:00:00-03	C:\\Program Files\\Google\\Chrome\\Application	\N	2026-03-10 08:48:54.189117-03	2026-03-10 08:48:54.382138-03
919f4ddb-8375-49db-aeb9-dc1e923f11cd	df504f2f-7059-4bc2-af90-0584c559138f	Git	2.51.0	The Git Development Community	2025-09-02 21:00:00-03	C:\\Program Files\\Git\\	356806656	2026-03-10 08:48:54.256472-03	2026-03-10 08:48:54.384411-03
b20ff402-457b-402d-a569-b97d04e4d204	df504f2f-7059-4bc2-af90-0584c559138f	McAfee Security Scan Plus	4.2.790.1	McAfee, LLC	\N	\N	28784640	2026-03-10 08:48:54.284566-03	2026-03-10 08:48:54.388177-03
da8f7200-820f-441d-8c0a-ec2f4093a8c2	df504f2f-7059-4bc2-af90-0584c559138f	KORG USB-MIDI Driver Tools for Windows	1.15.6001	Korg Inc.	2025-08-26 21:00:00-03	C:\\Program Files (x86)\\KORG\\KORG USB-MIDI Driver\\	5784576	2026-03-10 08:48:54.265113-03	2026-03-10 08:48:54.400747-03
1c7f5646-510f-40ce-983f-e62aa4547673	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Runtime - 9.0.10 (x64)	72.40.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	77651968	2026-03-10 08:48:54.268514-03	2026-03-10 08:48:54.405773-03
3027d62e-92b6-47c3-9fa4-eb0324a3b185	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual Studio Installer	4.0.2153.56108	Microsoft Corporation	2025-08-03 21:00:00-03	"C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer"	\N	2026-03-10 08:48:54.227185-03	2026-03-10 08:48:54.409287-03
fcb4e3d7-5b69-40a8-84b6-c100d89c58ed	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK ARM Desktop Tools	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2899968	2026-03-10 08:48:54.225435-03	2026-03-10 08:48:54.418521-03
3d490be6-7f64-45c1-a0c1-17dd3ab2f6d9	df504f2f-7059-4bc2-af90-0584c559138f	Android Studio	2025.1	Google LLC	\N	\N	\N	2026-03-10 08:48:54.20279-03	2026-03-10 08:48:54.419971-03
bd9d0b2c-069a-4dcf-b844-977c70569067	df504f2f-7059-4bc2-af90-0584c559138f	OpenUEM Server 0.10.0	0.10.0	Miguel Angel Alvarez Cabrerizo	2025-11-13 21:00:00-03	C:\\Program Files\\OpenUEM Server\\	919174144	2026-03-10 08:48:54.209273-03	2026-03-10 08:48:54.421663-03
25e4556c-e524-4444-a8f9-e54faf58351d	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Sdk.Android.Manifest-9.0.100 (x64)	35.0.7	Microsoft Corporation	2025-11-04 21:00:00-03	\N	724992	2026-03-10 08:48:54.327379-03	2026-03-10 08:48:54.423369-03
846ffcea-ec8a-4ae9-b60a-9a19e17bd411	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Edge	145.0.3800.97	Microsoft Corporation	2026-03-08 21:00:00-03	C:\\Program Files (x86)\\Microsoft\\Edge\\Application	\N	2026-03-10 08:48:54.23967-03	2026-03-10 08:48:54.460474-03
15cf18db-5523-4c68-ad96-a331ff58c830	df504f2f-7059-4bc2-af90-0584c559138f	SDK ARM64 Redistributables	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.244547-03	2026-03-10 08:48:54.463018-03
76637c71-443b-4271-89f1-fa1e678d5d20	df504f2f-7059-4bc2-af90-0584c559138f	Application Verifier x64 External Package	10.1.19041.5609	Microsoft	2025-11-03 21:00:00-03	\N	1888256	2026-03-10 08:48:54.187559-03	2026-03-10 08:48:54.469593-03
6243fef1-7dac-409a-bfa9-4ce2a2d3808d	df504f2f-7059-4bc2-af90-0584c559138f	PgBouncer 1.24.1	1.24.1-1	EnterpriseDB	2025-10-01 21:00:00-03	C:\\Program Files\\PgBouncer	49585152	2026-03-10 08:48:54.24113-03	2026-03-10 08:48:54.483298-03
b7a861c8-09d7-4f01-bed9-3981f4d7101c	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Host - 9.0.10 (x64)	72.40.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	495616	2026-03-10 08:48:54.281924-03	2026-03-10 08:48:54.486084-03
41dbc522-67ae-4937-a8d5-34f30cc08af9	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Apps Metadata	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	3969024	2026-03-10 08:48:54.234467-03	2026-03-10 08:48:54.488098-03
8b86a72e-21f6-4f01-82c1-4a421cf8aaf0	df504f2f-7059-4bc2-af90-0584c559138f	WinSCP 6.5.5	6.5.5	Martin Prikryl	2025-12-11 21:00:00-03	C:\\Program Files (x86)\\WinSCP\\	102122496	2026-03-10 08:48:54.316141-03	2026-03-10 08:48:54.508108-03
6e55465c-4806-475c-afff-1a5b74c1cfc9	df504f2f-7059-4bc2-af90-0584c559138f	Application Verifier x64 External Package (DesktopEditions)	10.1.26100.6901	Microsoft	2025-11-03 21:00:00-03	\N	471040	2026-03-10 08:48:54.299342-03	2026-03-10 08:48:54.50948-03
acfb4393-f7ed-4a25-b5e6-b2352600eb98	df504f2f-7059-4bc2-af90-0584c559138f	HandBrake 1.9.2	1.9.2	\N	\N	\N	\N	2026-03-10 08:48:54.270505-03	2026-03-10 08:48:54.511021-03
b9be7886-2570-4325-8417-39514a0cc474	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset Theme Viewer	6.0.2.0	WiX Toolset	2025-11-03 21:00:00-03	\N	249856	2026-03-10 08:48:54.230904-03	2026-03-10 08:48:54.249742-03
958b4adc-da77-4fcb-b704-420c4d7f04b7	df504f2f-7059-4bc2-af90-0584c559138f	Ubiquiti UniFi (remove only)	\N	\N	\N	\N	\N	2026-03-10 08:48:54.256425-03	2026-03-10 08:48:54.256425-03
d17f90f1-28ca-4a81-b147-b449e58bc857	df504f2f-7059-4bc2-af90-0584c559138f	Zebra Setup Utilities	1.1.9.1326	Zebra Technologies	\N	C:\\Program Files (x86)\\Zebra Technologies\\Zebra Setup Utilities	\N	2026-03-10 08:48:54.207623-03	2026-03-10 08:48:54.262239-03
12ac766c-533d-401e-97fb-e29e391b8109	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Tools arm64	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	12283904	2026-03-10 08:48:54.227045-03	2026-03-10 08:48:54.289599-03
f221bfaf-598e-4f9d-8bc7-ccece9563eed	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Apps Headers OnecoreUap	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	5668864	2026-03-10 08:48:54.252269-03	2026-03-10 08:48:54.29316-03
ffd76c21-ccfa-4584-b289-0cc756005a2a	df504f2f-7059-4bc2-af90-0584c559138f	Inno Setup versão 6.5.4	6.5.4	jrsoftware.org	2025-10-07 21:00:00-03	C:\\Program Files (x86)\\Inno Setup 6\\	23917568	2026-03-10 08:48:54.288167-03	2026-03-10 08:48:54.297576-03
2ecc8334-33b8-4189-9284-2e4c44ecc658	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset Command-Line Tools	6.0.2.0	WiX Toolset	2025-11-03 21:00:00-03	C:\\Program Files\\WiX Toolset v6.0\\	27725824	2026-03-10 08:48:54.242779-03	2026-03-10 08:48:54.301328-03
0e9770b8-8dad-4046-9a68-134f7704f238	df504f2f-7059-4bc2-af90-0584c559138f	Windows Team Extension SDK Contracts	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.277425-03	2026-03-10 08:48:54.304016-03
81a6e5b2-8d9b-4d55-9122-cf28ff275e0c	df504f2f-7059-4bc2-af90-0584c559138f	Adobe Acrobat (64-bit)	25.001.21223	Adobe	2026-02-18 21:00:00-03	C:\\Program Files\\Adobe\\Acrobat DC\\	1226371072	2026-03-10 08:48:54.247121-03	2026-03-10 08:48:54.328884-03
6b391740-a9dc-49a6-9296-a137964233e4	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET SDK 9.0.306 (x64)	9.3.625.47604	Microsoft Corporation	\N	\N	997843968	2026-03-10 08:48:54.225263-03	2026-03-10 08:48:54.332649-03
c4e9d56e-19b5-4201-bad8-5ec17feebb33	df504f2f-7059-4bc2-af90-0584c559138f	vs_communitysharedmsi	18.0.11121	Microsoft Corporation	2025-11-03 21:00:00-03	\N	33894400	2026-03-10 08:48:54.262109-03	2026-03-10 08:48:54.334876-03
2e7a26c8-2115-4fcd-970d-4778ca6ec981	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET 9.0 Templates 9.0.306 (x64)	36.11.57780	Microsoft Corporation	2025-11-04 21:00:00-03	\N	10547200	2026-03-10 08:48:54.324924-03	2026-03-10 08:48:54.336891-03
fe929ad3-c683-433c-a336-42927905f66d	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14 Native 2015 SDK	3.14.8722	.NET Foundation	2025-11-05 21:00:00-03	\N	20463616	2026-03-10 08:48:54.29137-03	2026-03-10 08:48:54.346225-03
e47dec23-94f2-48ef-819b-131cdae55d6b	df504f2f-7059-4bc2-af90-0584c559138f	Universal CRT Tools x86	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	1683456	2026-03-10 08:48:54.308464-03	2026-03-10 08:48:54.347969-03
aabefe45-2c15-46f3-8761-17d1c5121cb4	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Runtime - 6.0.36 (x64)	48.144.23141	Microsoft Corporation	2025-12-09 21:00:00-03	\N	71860224	2026-03-10 08:48:54.221762-03	2026-03-10 08:48:54.349663-03
c5c3dde3-d9bd-42aa-b3df-9bac412a760c	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Libs x64	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	70369280	2026-03-10 08:48:54.299523-03	2026-03-10 08:48:54.356137-03
40912710-ffec-4164-a67c-24001a926d74	df504f2f-7059-4bc2-af90-0584c559138f	Kits Configuration Installer	10.1.19041.5609	Microsoft	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.332554-03	2026-03-10 08:48:54.362761-03
69269ec4-9559-479f-abab-0d8081ba93df	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense PPI - Other Languages	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	446464	2026-03-10 08:48:54.364561-03	2026-03-10 08:48:54.370198-03
6656f1ae-d32c-4f00-b144-d8242161c672	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Headers arm	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	98304	2026-03-10 08:48:54.23832-03	2026-03-10 08:48:54.3729-03
057fb2f5-2bbb-48c0-b074-ce926036bd72	df504f2f-7059-4bc2-af90-0584c559138f	PostgreSQL 18 	18.0-1	PostgreSQL Global Development Group	2025-10-01 21:00:00-03	C:\\Program Files\\PostgreSQL\\18	1098285056	2026-03-10 08:48:54.370047-03	2026-03-10 08:48:54.380146-03
54e394df-b084-4cd4-a21a-b09a537745f1	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Runtime - 8.0.18 (x64)	64.72.35889	Microsoft Corporation	2025-07-30 21:00:00-03	\N	73674752	2026-03-10 08:48:54.33858-03	2026-03-10 08:48:54.394826-03
2782f013-0f3f-4475-bf72-19d13573d7a3	df504f2f-7059-4bc2-af90-0584c559138f	vs_communitymsi	16.11.34930	Microsoft Corporation	2025-11-03 21:00:00-03	\N	38285312	2026-03-10 08:48:54.211626-03	2026-03-10 08:48:54.407873-03
534efa4d-8447-4cec-a6f1-d64363b33420	df504f2f-7059-4bc2-af90-0584c559138f	MSI Development Tools	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	4370432	2026-03-10 08:48:54.280082-03	2026-03-10 08:48:54.409472-03
1663258e-a444-4277-892c-a5f14cc92335	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Host FX Resolver - 8.0.18 (x64)	64.72.35889	Microsoft Corporation	2025-07-30 21:00:00-03	\N	344064	2026-03-10 08:48:54.342365-03	2026-03-10 08:48:54.411127-03
1d996258-740d-45a9-98ae-e29aea21b97a	df504f2f-7059-4bc2-af90-0584c559138f	IntelliJ IDEA Community Edition 2025.1.4.1	251.27812.49	JetBrains s.r.o.	\N	C:\\Program Files\\JetBrains\\IntelliJ IDEA Community Edition 2025.1.4.1	\N	2026-03-10 08:48:54.239825-03	2026-03-10 08:48:54.41826-03
df9482fa-5b3f-4bc9-81d8-b116924be846	df504f2f-7059-4bc2-af90-0584c559138f	TightVNC	2.8.85.0	GlavSoft LLC.	2025-09-25 21:00:00-03	\N	3207168	2026-03-10 08:48:54.297751-03	2026-03-10 08:48:54.419843-03
cd77959a-9816-431a-8ba8-00d9a2d61de6	df504f2f-7059-4bc2-af90-0584c559138f	Go Programming Language amd64 go1.25.4	1.25.4	https://go.dev	2025-11-17 21:00:00-03	\N	243505152	2026-03-10 08:48:54.23443-03	2026-03-10 08:48:54.423534-03
2d039d04-887b-4c98-b830-0ee0aac73374	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Visual C++ 2022 X86 Additional Runtime - 14.50.35710	14.50.35710	Microsoft Corporation	2025-11-03 21:00:00-03	\N	10596352	2026-03-10 08:48:54.415605-03	2026-03-10 08:48:54.44883-03
ee0d9e92-c6dc-4b60-b9aa-3a1266260f46	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Toolset 9.0.306 (x64)	36.9.57780	Microsoft Corporation	2025-11-04 21:00:00-03	\N	406548480	2026-03-10 08:48:54.386467-03	2026-03-10 08:48:54.452766-03
c489efa0-9945-4d0d-bf50-ea3d3c2de28a	df504f2f-7059-4bc2-af90-0584c559138f	Ferramentas de Build do Visual Studio 2019	16.11.52	Microsoft Corporation	2025-08-03 21:00:00-03	C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools	\N	2026-03-10 08:48:54.363067-03	2026-03-10 08:48:54.458456-03
38c2fa28-41b2-4c64-b955-9a0adff5e8be	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK EULA	10.1.19041.5609	Microsoft Corporations	2025-11-03 21:00:00-03	\N	290816	2026-03-10 08:48:54.322908-03	2026-03-10 08:48:54.471501-03
5a028f85-0059-4e50-896d-bd05368c37c3	df504f2f-7059-4bc2-af90-0584c559138f	RustDesk	1.4.4	RustDesk	\N	C:\\Program Files\\RustDesk	362496	2026-03-10 08:48:54.348588-03	2026-03-10 08:48:54.480686-03
244976d4-cda3-48fa-8305-677b9b2c87ef	df504f2f-7059-4bc2-af90-0584c559138f	CMake	4.2.0	Kitware	2025-11-03 21:00:00-03	C:\\Program Files\\CMake\\	153431040	2026-03-10 08:48:54.394683-03	2026-03-10 08:48:54.490328-03
8ac0f64a-6ca8-4392-a8c7-2e3f6a395a74	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Standard Targeting Pack - 2.1.0 (x64)	24.0.28113	Microsoft Corporation	2025-11-04 21:00:00-03	\N	20369408	2026-03-10 08:48:54.396321-03	2026-03-10 08:48:54.494081-03
1e5843cd-c18d-4d8f-a34a-4c97eaf3ccb0	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset v3.14.1.8722	3.14.1.8722	.NET Foundation	\N	\N	289395712	2026-03-10 08:48:54.295729-03	2026-03-10 08:48:54.498171-03
e1132153-c6d6-480f-8de1-84ebd08e7b52	df504f2f-7059-4bc2-af90-0584c559138f	VS JIT Debugger	17.0.157.0	Microsoft Corporation	2025-11-03 21:00:00-03	\N	3001344	2026-03-10 08:48:54.220166-03	2026-03-10 08:48:54.519132-03
dcd552b6-4a49-4ed6-8141-549eb7e746cb	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Headers x86	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	92131328	2026-03-10 08:48:54.241331-03	2026-03-10 08:48:54.523792-03
dd69bb32-f156-4287-98e2-3075860aeb1f	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Headers x64	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	40960	2026-03-10 08:48:54.452786-03	2026-03-10 08:48:54.524883-03
c104b291-c18c-4b60-a003-1f74140242f6	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET Host - 6.0.36 (x64)	48.144.23141	Microsoft Corporation	2025-12-09 21:00:00-03	\N	167936	2026-03-10 08:48:54.306588-03	2026-03-10 08:48:54.528659-03
6cc9fcf5-07cf-463c-b743-53e92b51ff25	df504f2f-7059-4bc2-af90-0584c559138f	Universal CRT Redistributable	10.0.26624	Microsoft Corporation	2025-08-03 21:00:00-03	\N	5517312	2026-03-10 08:48:54.407631-03	2026-03-10 08:48:54.529638-03
977d4d96-d1ed-4fb2-8b80-2a6512802852	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Apps	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	98304	2026-03-10 08:48:54.398864-03	2026-03-10 08:48:54.534941-03
1189242b-7cf1-474b-9b72-26775ae8678e	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft.NET.Workload.Emscripten.net8.Manifest (x64)	72.48.40820	Microsoft Corporation	2025-11-04 21:00:00-03	\N	647168	2026-03-10 08:48:54.353819-03	2026-03-10 08:48:54.360538-03
38235988-a770-4857-b389-f87aab9a30df	df504f2f-7059-4bc2-af90-0584c559138f	WinRT Intellisense UAP - Other Languages	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	129548288	2026-03-10 08:48:54.358717-03	2026-03-10 08:48:54.366352-03
8b359f3c-61bd-4f3a-b8f0-b558f444cc32	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Desktop Tools x64	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	17281024	2026-03-10 08:48:54.367724-03	2026-03-10 08:48:54.375018-03
87d41911-1a55-4917-9c7b-9fe7fe116354	df504f2f-7059-4bc2-af90-0584c559138f	vs_tipsmsi	18.0.11101	Microsoft Corporation	2025-11-03 21:00:00-03	\N	47104	2026-03-10 08:48:54.35138-03	2026-03-10 08:48:54.390222-03
c1cde645-c7d3-4d5b-8878-9197c25ca355	df504f2f-7059-4bc2-af90-0584c559138f	Office 16 Click-to-Run Licensing Component	16.0.19029.20208	Microsoft Corporation	2025-08-21 21:00:00-03	\N	7454720	2026-03-10 08:48:54.398706-03	2026-03-10 08:48:54.398706-03
3ceb327a-1955-46e8-86be-02889dcd1577	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft .NET AppHost Pack - 9.0.10 (x64)	72.40.40927	Microsoft Corporation	2025-11-04 21:00:00-03	\N	12554240	2026-03-10 08:48:54.376773-03	2026-03-10 08:48:54.411035-03
2678448a-7b92-40df-a2e1-7a0f67f0ae9d	df504f2f-7059-4bc2-af90-0584c559138f	vs_communitymsires	18.0.11104	Microsoft Corporation	2025-11-03 21:00:00-03	\N	69632	2026-03-10 08:48:54.412662-03	2026-03-10 08:48:54.412628-03
3526af92-5f6e-4a9c-b792-4474c79dd537	df504f2f-7059-4bc2-af90-0584c559138f	Python 3.13.5 Documentation (64-bit)	3.13.5150.0	Python Software Foundation	2025-07-24 21:00:00-03	\N	61714432	2026-03-10 08:48:54.421516-03	2026-03-10 08:48:54.421516-03
624c8a1b-492d-4b13-9beb-c4edfee815ac	df504f2f-7059-4bc2-af90-0584c559138f	WPTx64 (OnecoreUAP)	10.1.26100.6901	Microsoft	2025-11-03 21:00:00-03	\N	6856704	2026-03-10 08:48:54.426162-03	2026-03-10 08:48:54.426162-03
5d294fcc-349a-4df7-a835-f8da6c511e14	df504f2f-7059-4bc2-af90-0584c559138f	Node.js	22.18.0	Node.js Foundation	2025-08-03 21:00:00-03	\N	103080960	2026-03-10 08:48:54.330962-03	2026-03-10 08:48:54.436538-03
c64b27e9-36ef-4de1-a9e5-38129c31bf78	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK for Windows Store Apps DirectX x86 Remote	10.1.19041.5609	Microsoft Corporation	2025-11-03 21:00:00-03	\N	2969600	2026-03-10 08:48:54.366016-03	2026-03-10 08:48:54.442335-03
34481550-0c8d-499d-ae49-56227bde6c11	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK Modern Non-Versioned Developer Tools	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	10838016	2026-03-10 08:48:54.415445-03	2026-03-10 08:48:54.44685-03
07a8f4e7-e0bd-410a-b0e1-78a845cb7c82	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft ASP.NET Core 9.0.10 Targeting Pack (x64)	9.0.10.25475	Microsoft Corporation	2025-11-04 21:00:00-03	\N	18509824	2026-03-10 08:48:54.400543-03	2026-03-10 08:48:54.457842-03
c6cac0ac-27b5-4176-955e-b33aa0ccc931	df504f2f-7059-4bc2-af90-0584c559138f	psqlODBC 13.02.0000	13.02.0000-1	EnterpriseDB	2025-10-01 21:00:00-03	C:\\Program Files\\PostgreSQL\\psqlODBC	13985792	2026-03-10 08:48:54.336756-03	2026-03-10 08:48:54.466187-03
8b9bddb3-b20c-4d91-b23d-0bac90284588	df504f2f-7059-4bc2-af90-0584c559138f	Windows SDK DirectX x64 Remote	10.1.26100.6901	Microsoft Corporation	2025-11-03 21:00:00-03	\N	589824	2026-03-10 08:48:54.47582-03	2026-03-10 08:48:54.496149-03
eb1fe8a0-8e5f-4a9a-a167-d926dd21349e	df504f2f-7059-4bc2-af90-0584c559138f	vs_CoreEditorFonts	17.7.40001	Microsoft Corporation	2025-11-03 21:00:00-03	\N	745472	2026-03-10 08:48:54.390265-03	2026-03-10 08:48:54.500826-03
6aa66914-27d2-4b98-b7b0-c85022a73318	df504f2f-7059-4bc2-af90-0584c559138f	WiX Toolset Additional Tools	6.0.2	WiX Toolset	2025-11-03 21:00:00-03	\N	1517568	2026-03-10 08:48:54.36424-03	2026-03-10 08:48:54.50189-03
ec7f09d6-5151-4dc8-a124-d7dcbba0f4b7	df504f2f-7059-4bc2-af90-0584c559138f	WPT Redistributables	10.1.26100.6901	Microsoft	2025-11-03 21:00:00-03	\N	247656448	2026-03-10 08:48:54.50159-03	2026-03-10 08:48:54.503271-03
a9c36a1a-d4e7-4bdf-bd74-38a9168f8580	df504f2f-7059-4bc2-af90-0584c559138f	WinRAR 7.13 (64-bit)	7.13.0	win.rar GmbH	\N	C:\\Program Files\\WinRAR	\N	2026-03-10 08:48:54.527617-03	2026-03-10 08:48:54.527617-03
\.


--
-- Data for Name: computer_locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_locations (id, computer_id, latitude, longitude, accuracy, provider, address, created_at) FROM stdin;
fe08b407-b929-460f-b9b8-b43a8ffcd346	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:23:07.108128-03
42cc0c71-43b2-499f-92da-bf00bf423c8f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:25:10.12651-03
f2a71d09-aa02-4874-87cc-b7b38356e36c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:27:07.830402-03
2985d3b9-f6a4-4e7b-9e60-73e813909b1b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:28:07.346206-03
96163115-412f-4aae-92da-07303f2a1a53	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:31:08.223705-03
0ce27018-b343-4d83-8d2f-a747d236fc9f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:35:08.662627-03
c144df9f-58a4-4a5a-8b21-b2860adbec8a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:39:07.741074-03
29d99a5f-3f6f-4864-92ea-f40e0b48d827	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:44:11.107868-03
f5280356-8a6d-4fe0-af2b-608bbe42ee3b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 16:09:40.156454-03
6f8ba918-08c4-4266-ad4c-76c72075758c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 16:11:41.210414-03
df740ae1-8c00-43be-9696-3b053e46e098	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 16:12:39.370725-03
29bb5f51-50a0-43c0-b137-22faef3d3c50	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 16:13:42.103746-03
527ae9ca-85e4-46c8-92e1-ff5c973becdf	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 16:13:42.133263-03
bda0107d-7199-445d-a1df-07d9157b69f0	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:03:23.353154-03
2812f6b4-4cd9-4f23-8671-9151fcd595e3	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:28:15.555583-03
e5de94a7-006c-437b-b086-140e4fdf5adf	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:32:15.375858-03
7d23e341-3f3f-4d9c-97f3-cf16773f74e8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:36:14.905719-03
a2abdb03-f265-4fd3-8c3e-5c9da5e14d0f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:40:15.428093-03
cff01a14-d1de-4413-8ea4-1ec8c0a893af	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:40:33.335757-03
5f0821f7-2c15-4952-af6b-912537816d81	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:44:15.383348-03
9dc3510a-470d-4cd3-a795-bacdc0c7c12d	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:45:33.626354-03
ba6f00d6-0111-45be-8ed5-8ef0ab8603fe	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:48:15.290568-03
bb618113-2fae-4a79-bc54-c630824bd95e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:52:15.655855-03
a2bad96d-df78-46d6-9933-7d7feda65bbb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:56:15.971488-03
c7d3cc95-1b37-4c32-a02b-b2252e777f68	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:00:16.492121-03
a66ef41a-cc2e-4376-bca8-6a87c0771b44	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:04:15.614587-03
7fd93a63-ef8e-4105-acac-b24c8dde6807	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:05:33.318036-03
867d1821-05cc-41a0-9b52-6e003f72ba98	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:06:16.112607-03
83b5f92b-cad9-4f99-96a4-dd7ec48f9bc6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:08:15.477111-03
b5e8d621-19e1-431d-a7e4-4b1cc2a26530	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:12:15.472804-03
dd6b843e-a87c-40db-8238-0754a1feeac6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:14:16.610637-03
a1aa55a3-bdf5-4f12-a31d-25f234911b24	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:16:15.009796-03
72787143-3602-4ead-97c5-c5349ad12daf	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:20:15.452286-03
bf88b76a-fdd2-4e4b-97ad-f704aef3bc79	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:20:33.231213-03
54f89ab6-f5ee-406a-bd4b-72b48b0a11d2	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:22:18.198868-03
bc175648-c161-47f0-b336-295ae71a6e9b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:22:18.213436-03
1f86911c-f96e-43df-89b6-85b4205c581b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:26:14.995954-03
76bad05c-a65d-4785-9a3d-2da6e376e587	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:30:15.342955-03
01e8463a-6296-4982-930b-b41ec3113fbb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:30:33.356297-03
ad55c54e-73fb-4e87-aaa2-f63b6e6281f5	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:34:15.585072-03
63430033-2272-42bc-a257-18ed0401679e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:35:33.566726-03
5795dbe8-d1ee-457e-8b2e-cfc8485ffdce	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:36:16.081993-03
fb6e21a5-b620-4f23-9aa1-234dd7e45f63	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:38:15.520428-03
732eec75-d1ec-48b5-b824-d8c38a1fef9b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:40:16.714957-03
ab43a048-8b85-475e-8d57-5323f9b40bc9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:40:33.324872-03
2d7d3e9e-2026-4ba2-80b3-b4e520f950f7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:42:15.430028-03
93ac2019-5d98-4a68-b0cf-e699d2484b15	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:46:16.164903-03
726764e8-48b8-4305-9bb1-f617c1d8b5bb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:50:15.574423-03
b2e08adc-6f60-4e54-80de-f8758fd1d52e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:50:33.370915-03
7fda7c87-aa24-4f87-bfcd-ad0dbe1cd1d6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:54:16.534431-03
fae58485-8fc5-44eb-b7a3-c00d28ee12a1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:58:15.766516-03
4028bb39-708b-42be-a4e6-28edabfcdfe4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:00:16.670705-03
5417f440-650b-4527-b066-91ce18101910	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:02:16.68335-03
23041e29-aa95-48cf-8113-704b67125da4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:05:33.514405-03
2cf2530b-fbd7-4334-9dea-dc13fd361269	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:06:16.283826-03
40736a55-fadc-4cfd-a072-1026eae0b7d6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:08:15.567409-03
4c577880-920c-4148-b8e1-d326acad1ae7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:10:17.034953-03
c57cd6c8-71f3-49f2-8132-bf7aca0ebd7a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:10:33.27056-03
84296eba-8358-44f0-9284-49c6c3943490	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:12:16.766956-03
71915c2a-50cc-4902-9f47-cf79d47ca8cd	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:14:16.759141-03
a5f30e9b-60fe-45d2-81b9-323bfcbe65b9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:18:15.614478-03
a8ed8304-25d8-4c22-b68d-a82ca4370d75	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:22:16.869721-03
b9cebde2-2d2c-4963-825c-64205945f422	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:26:15.159956-03
01a6ea63-5cae-4529-8b0a-1b1b9a8f2df4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:28:16.938367-03
81aab8ba-0721-4679-8f76-2e6d7f805b25	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:30:15.477882-03
df97f600-3b5e-4449-8e6c-c985ae575e54	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:30:33.374779-03
9a7993cd-8d8e-45e2-8e9b-968ce9195790	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:34:16.847202-03
6370ed33-389c-4327-ae07-f370c5d67657	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:36:15.03281-03
1fa421b2-ebc7-4c08-b6c5-711f6c492db3	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:40:15.694506-03
5ac3a074-fd8c-4a3b-9987-be69e35333de	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:40:33.377642-03
2e1c4681-dc28-4c76-bf39-ceb82d6ca51e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:44:15.573664-03
888645f2-4c0b-43b0-b280-e1a8e2e0f772	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:45:33.778387-03
5935ad91-d398-4285-99e6-3ccf03e39756	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:48:15.625135-03
991d5cbc-1cd7-45ea-83d4-787a35cbab6b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:50:16.701774-03
f57d5974-f5db-461c-9fc9-073e550f46f7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:50:33.329617-03
1424696d-e211-483e-8867-b1479d88d8ed	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:52:16.860678-03
4b4ab610-13de-4b57-b21c-accfcd3fe19f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:52:16.865427-03
82948c41-7ede-4ce6-8639-b0d148734d2c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:54:17.998325-03
e7bd636e-16ca-4d29-9d2f-647509fc7636	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:55:33.556538-03
406bf440-9303-4026-b3b7-c75ed16ab3f4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:55:45.157113-03
d0e94315-aed1-4a5c-97ba-a77357272b8e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:59:15.862456-03
e4faf9a0-590c-4c4a-95ee-2cd03062b05b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:00:33.475356-03
d10c8e42-62f7-4e08-aa34-da04701c3b53	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:03:16.857518-03
931a35d4-36d8-463c-9c85-88e1680057c6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:07:15.416453-03
cb7d128d-4328-415f-b560-8cde67f75ea9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:09:16.834397-03
7f95440f-195c-44d2-a9af-fd351305c45b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:10:33.74238-03
3b9175b9-0100-43bc-b5a9-ed2e36234b31	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:11:16.492868-03
a27790db-fd4f-4cf7-8b7e-3aab8a543708	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:11:16.614335-03
98464ede-c023-44d5-ab0e-ff6eaaa2fe83	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:13:16.568601-03
f58c82b8-a928-4f96-b67a-5f1a3d8eeddd	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:15:16.63374-03
0baa6357-9030-4e85-b870-31d52d6e8631	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-13 18:12:26.617106-03
4d2a876d-e92e-41c0-a458-2c4edd573c7e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 07:56:59.288411-03
33ef0079-ad2d-4f70-a23f-dc9269d28b99	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:00:34.861268-03
8a8ab0fc-c913-4328-8f22-82832b27ab4a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:00:51.731406-03
d269ae9a-a42c-4772-8d7b-5a1981d34f21	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:02:53.554269-03
98f9b9ec-93fc-4ba8-95dc-8c2238f5b2bf	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:25:10.15698-03
9e37a4e9-8ec9-42e9-848b-40fd046d14fe	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:29:07.486154-03
9b841bb9-54b8-4566-be80-22ec777e472a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:33:07.670116-03
856cf643-e31f-43dd-9aa9-b38e7a2241e3	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:33:07.910308-03
d70931fc-41d7-4573-b222-1e9b7eb1d20b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:35:08.695719-03
a7117dc9-5ca6-4865-a770-4b83387c8981	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:37:08.504625-03
68602871-3a61-4ee6-b893-556351b1112c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:37:08.609836-03
adcdbb77-ba29-4917-9889-a53b40d92c90	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:38:06.65549-03
51778236-4511-419a-9220-415dab309b1c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 15:41:10.916884-03
2e4c7e51-14b3-4be0-9a25-047201022515	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 16:07:40.312303-03
9629247b-a0da-4fc1-8031-45955c2394a6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 16:11:41.181045-03
e5c19f6b-60c5-46d9-97d9-1f3fcee31da2	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-08 16:13:42.195187-03
b2ddaa2e-3789-4b6d-87d5-770e958c4143	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:03:23.491981-03
1c092ef7-f3af-4935-b8ff-505c91f9c599	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:03:23.522428-03
03b84187-71b6-4fb5-97dc-71afd7f3ea29	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:30:14.978874-03
6abb3613-55b8-47ec-b350-0f418652456b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:30:33.407599-03
1e72441e-f953-4c94-99f0-d87d7f067174	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:34:15.562041-03
9571ec01-197a-4db8-ba62-a63e31a414b8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:35:33.655971-03
ec280925-02d6-4142-98ba-8931643d8622	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:38:15.361551-03
1206bb8a-df27-4907-b6b5-51a82f3b887c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:42:14.968669-03
60b8f9e6-0b5e-4946-9e12-4b8f7e81fc90	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:46:14.848469-03
d538281f-1887-40a3-bf38-b06bdaf1bac1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:50:15.429886-03
dffb0df8-d126-426a-964c-b7265f69d0e5	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:50:33.274015-03
b8fea920-5865-4728-af45-198101e674e9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:54:15.452688-03
14f19f94-3490-46c1-b136-1431c76395e1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:55:33.490653-03
34996d08-d4b3-4a62-aebd-ea515ef6e7ba	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:56:15.991615-03
f9f9aa8e-b32d-4af3-8041-a2b803aaaac1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 06:58:15.634833-03
8cfaaa36-dcfb-4aed-aa76-a00bce79e544	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:00:16.501323-03
43b4bfc3-b48f-4a94-a9cd-61bf7fb23cbd	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:00:33.260908-03
29e9faf8-818d-4196-a14d-bb10fe3c2510	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:02:15.331505-03
f1ad5a34-94f5-4605-a627-b5a60d57c07f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:06:16.119482-03
dae85201-9335-498a-b18f-aae588fd0a2a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:10:15.648457-03
13439a26-f73c-4eae-b646-ce2c775939f7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:10:33.205651-03
215c7519-af47-4141-89e2-694509b10d2b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:14:16.617579-03
a57ef2fb-106b-4a44-954f-bcf0fd0fadb4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:15:33.560647-03
92b2803f-4f94-4653-8f39-2fd1fbd44f1b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:18:15.473419-03
61a85f6c-4f43-4efb-b8a2-ec6560149e72	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:22:18.193612-03
e5a6d1ac-aff5-4915-83a1-a51960cd8cdf	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:24:15.503361-03
a6f1effc-31bb-4f76-86dd-62187ffe5fc0	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:25:33.589143-03
6c99f919-f5ca-441a-a910-91872311cfe9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:28:15.632621-03
e7a12257-42a2-4069-8d55-36fe789bb8a1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:32:15.401749-03
9402b9a2-ccb1-4114-be77-a9fe1128e373	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:36:16.046773-03
557c1877-116c-4251-8560-e55474c002a1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:40:16.63386-03
23933dde-1355-4b8c-8076-838697b10a46	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:44:15.436371-03
5ff4aa00-701c-4279-92de-a5bdf159b8b7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:45:33.80408-03
b47da296-211c-4e3d-932e-f497ed46d5c8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:46:16.170782-03
69e646a2-716c-43be-ac43-82d93a115e94	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:48:16.640501-03
6e048d5c-218f-4fb4-aec9-d90720bd7498	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:48:16.652101-03
586e4caf-e3c7-48b8-8a48-1bd2e6667f64	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:52:15.74938-03
c9a16876-7040-40d2-9c9d-73c36426dcab	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:54:16.633856-03
ed307449-eb32-4a65-b043-450f33d17d50	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:55:33.627636-03
1d750204-0fa3-443e-8a7a-654a0b7c973b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 07:56:15.006182-03
2b2b5e3b-e84a-4bad-9ec8-1b692cb382aa	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:00:16.677179-03
8646e32b-1388-417a-b87d-92d0faf5c6e0	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:00:33.373717-03
932c3983-e93c-4f7a-940d-d9907150c5be	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:02:16.71816-03
2deaf314-abba-4f3d-8330-6ddc756fb7c3	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:04:16.890152-03
11b63319-9309-41b9-8ddd-8687e8126585	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:04:16.995925-03
2b6f4909-6353-4bfd-ba01-d876efb13ae7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:06:16.296016-03
ab70e9d0-225c-4ed7-ad9c-d7d8651bc693	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:12:16.780811-03
841e688d-dfbf-4805-ab30-4728717ae971	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:14:16.765909-03
62b20530-b766-4c61-b52a-a2211f3f76a8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:15:33.731021-03
cbb4e69b-3757-468f-ab42-f03c3e021adb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:16:16.297627-03
bf610698-4da8-4bb5-92cb-633d00f94616	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:16:16.326853-03
1a9c5568-e500-4822-9322-4edc034a0959	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:20:15.606047-03
c556e29d-5de2-4dd0-8419-dea8826b755f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:20:33.366724-03
4e171eaf-1c94-4e8c-ab3a-29be748fe0c8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:22:16.936772-03
ef9f0bd5-4980-4556-8edf-64589880921b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:24:15.557638-03
5954dffc-a23a-438f-b41d-75d476db4a97	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:25:33.586509-03
e1a18b32-3837-4904-b635-14107bc0f5b6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:28:16.938209-03
a50e1c87-7332-411c-836f-d5c86d6b899a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:32:15.458355-03
a2c53f5a-3343-4384-a202-ba7c64e817c6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:34:16.881495-03
7d6cbf1c-0b49-4c43-ab4f-ef22b22fbb5a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:35:33.607487-03
1b4a08be-49d0-414b-9fe0-80b07ce3e50e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:38:15.570548-03
69150abb-97eb-4553-a422-73deb6e2e416	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:42:15.442501-03
891ef154-44f0-459f-b7c4-56578f5028d4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:46:15.05685-03
1da64f1a-98b8-450d-9e9a-206a88126835	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:50:16.561951-03
b459c986-6421-482e-bd82-12599d0414e1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:54:17.849775-03
5453e043-779f-4f98-b698-8a4e54c000cc	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 08:57:15.430493-03
e29ef3eb-06eb-48d5-a416-76d3aeecac40	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:01:15.178821-03
7045d414-949f-4c38-833a-36610676dfbe	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:03:16.906461-03
e28f42d8-7086-4303-9ecc-6896f4acfdd8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:05:17.084865-03
b851fe1a-570d-4ad6-b1ae-f02df592b567	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:05:17.093023-03
e2433a5d-f88a-4b35-9326-db9e827ac986	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:05:33.297945-03
b9ed2dc0-94c9-415d-8259-9e0f7fde3919	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:09:16.811679-03
a6959abd-a498-46aa-bdc5-351fb69c55b9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:13:16.568501-03
119fdb3d-c53c-4b61-bbf9-17b759ebc605	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:15:16.760788-03
5b851370-3db6-4ed9-aa15-69f827ddaa74	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:15:33.287719-03
a86f03bd-1904-4fb8-b3b7-38c29b35b842	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:17:16.516399-03
53bd8320-d800-4452-90c7-95b7f933ac40	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-09 09:17:16.538788-03
b5bdb17d-72d1-41f3-a5c5-56110cef41e5	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-13 18:12:26.593704-03
f6fc9f6c-404f-4fc9-8646-e1985f19d8c3	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-13 18:12:26.733406-03
22b65ae1-aac5-478f-bc61-2a222d9a3fa9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 07:56:59.261332-03
57eefbbd-0a5a-42a9-9ca8-cd79c44e7397	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 07:56:59.318001-03
5a3a0029-f032-45b0-aba0-e5f80333fb69	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 07:58:53.410477-03
14a88163-66a0-45ce-bd03-ce2c296912bb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:02:53.576659-03
099a90a6-d5df-42a4-81b1-14a8d0ca5c07	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:04:53.258148-03
f2cd91b0-2686-4669-9df6-8981365383cc	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:04:53.273891-03
84653879-e90e-4ff8-8de3-4af633c8d627	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:05:34.445591-03
53d45c11-fed9-427c-8abb-dba2b9f634cb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:06:53.264384-03
a9a95818-53a7-457d-b876-ac8067bbd35c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:08:40.179316-03
096e3d9e-7f89-46e4-8c29-a0ae39649445	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:10:19.495657-03
fad45f5b-1bfc-4e86-8a86-d6d8e99db5e6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:10:37.824809-03
cf893faf-7b79-4a28-ad2d-a376f644984c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:12:41.771292-03
b8836d2d-dd53-4f20-8e34-a85094a3c166	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:12:41.842706-03
ed5212bb-1b50-4026-87c4-f3351db975b7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:12:41.928736-03
4c9b1504-75de-49ad-ba8a-2eff6cfa74f8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:14:38.648089-03
ed4d6e4c-1c12-4019-8604-7954d48a678e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:15:33.61814-03
d90a2403-ccbf-4cf0-8632-e1e82a549ea6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:16:39.329559-03
4d50f78a-cb5c-480c-be84-f10ccdddcaaa	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:16:39.347552-03
1322440f-397c-40dd-89d1-b3d0c80960d0	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:18:38.382641-03
86324e81-62c0-46a4-9dcc-e8f9eec34c57	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:20:35.150732-03
e1b82f55-e5e7-468f-b0f4-d41a30c0428a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:20:37.720476-03
d5ac4366-c4ca-4757-a0b0-6761f5dfd9b2	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:22:40.850946-03
7055850a-c72e-40ef-be1f-85e320438ef4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:22:40.907815-03
df91175c-3415-4c6b-944a-5754b390f7f8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:22:40.929528-03
f4141c82-7139-4e8c-9804-95da87f6a0ab	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:24:39.018321-03
b7cae2c8-cafd-4416-a85f-620a96ad6001	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:25:34.60334-03
57f70419-4cc5-4b95-b5df-84aefeaaff47	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:26:38.194489-03
3773745d-d905-47fd-857b-ec162fa0ffee	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:28:39.455028-03
78d2331e-bf09-4a9b-89f7-ed527bde213e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:28:39.459056-03
2f4ae5e9-a8ad-438e-8305-2a9efc7af377	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:30:34.846557-03
10776455-0ca5-45e9-ae67-c365fe479707	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:30:37.632884-03
03130acb-3f3d-4e9e-a571-ae35e3dba1aa	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:32:39.560696-03
8f5da0ec-3706-4625-89f1-7a82ce4e0797	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:34:39.358002-03
c0c72f4a-4081-4ae2-84f2-502872055f4b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:34:39.409601-03
f361277b-07dc-4e94-bf17-e045a897b85c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:35:34.518878-03
1b15042c-fb4a-4d16-834c-e4f1fd733fb8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:36:38.134318-03
837858f5-7758-44f8-a936-427ea4bc73bf	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:38:39.529089-03
7d1e5057-cdbb-4ea5-a13a-4d6c3a84d4bb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:40:33.843038-03
6a98795c-dcb2-4123-90f5-99988b2497d6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:40:37.600736-03
f35ac79e-94b5-481c-8225-b6c61b307c77	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:42:39.240673-03
a17c1d41-8332-451c-9e3d-308634ba87fa	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:44:39.382333-03
bb1f8ef8-7829-48b8-bb49-a396058226e8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:45:34.450177-03
4a16b980-4e00-4bc7-a481-fe82beb62d2c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:46:39.122288-03
08f3aac2-a377-42c3-8125-5bbbf156d445	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:46:39.129739-03
c0c7954a-cdd8-4c26-badb-cba46aa7ed19	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:48:39.170665-03
8ea9f5ba-05bd-44dd-a789-cec6bfea0b4a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:50:34.919714-03
7b7ca5cc-6b4c-4192-a67a-3d5141f232e3	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:50:38.72745-03
0a90df55-cce4-4a9d-96ef-fbb086e83777	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:50:38.950912-03
ab31f63d-a84c-44dd-9519-1d9ad84e2415	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:52:39.282522-03
36ce4f29-1792-4851-bf63-57589b1639a7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:54:38.198541-03
646e000d-0a95-46da-9b97-7711288d9caf	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:55:34.427214-03
6cd97af8-418d-4032-8e8b-5b6cc0b11562	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:56:38.151435-03
a3cf3251-8733-4645-8d05-79efb68829ad	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:58:40.077673-03
753e1a0a-e7af-46a4-9c8a-4181d69c1d72	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 08:58:40.090406-03
7621462e-d80b-433c-89af-cc5095ce9f0b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:00:34.768604-03
4640013d-e3e7-4bd2-87fc-f90cd799d313	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:00:37.712035-03
2b69e338-7a38-44db-8f80-d1dc6259d14f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:02:39.504176-03
0b5d728d-c1ed-4490-a8a1-ce202766abc8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:04:39.355934-03
09e68541-6868-4aaa-b159-1b83d30d63c1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:05:34.416986-03
e838220f-7ac4-4e03-a97a-d61c8f539b81	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:06:38.770359-03
682ace0d-458d-4824-b7a6-11004de0bc30	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:06:38.797555-03
756fb3f5-7234-4ab6-94b0-9f0e357d71f6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:46:19.827827-03
b3e39b72-2bda-43a8-91b0-b61edc0f8be1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:46:19.89058-03
42e43b1b-6dd9-4085-95e8-46cc318615db	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:46:19.90847-03
b9772776-f230-4961-97af-8f38b3065dc3	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:48:09.506084-03
24043df9-6b20-4561-960f-6f347c615f26	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:50:08.982006-03
852ff413-f1ca-48cf-9793-712e0f935828	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:50:34.982577-03
b3db6bf5-ac94-4fa8-8cd8-ca78fd1b2fac	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:52:10.172097-03
b0fb55ce-111a-487e-a7a4-ae7999536095	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:54:12.350768-03
ef495152-2de3-4de0-abc2-d6652cf9104b	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:55:36.74571-03
3aa9c070-f061-4168-8df6-3d6c57548117	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:56:10.737538-03
8127d624-d85c-417f-9cb1-e0e4055bf818	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 09:58:09.516899-03
b21bcb49-ff2b-46cd-a91c-434b7c937787	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:00:10.942707-03
93617331-17dc-447d-8927-2b16d7a644ed	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:00:35.77315-03
7db45f2d-644f-4d2c-8eb6-3c9139cdbf8c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:02:10.82465-03
44d82b8c-536f-4aca-bbf6-dbc8ee883409	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:02:10.854991-03
a82a4b82-ed1e-4a46-bd74-d0abd5141199	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:04:09.740588-03
08e36a5a-230e-462a-8ef1-1904f79195e6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:05:34.824303-03
b540a66b-838b-4a38-b3bc-1d69ebe5650f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:06:10.261767-03
9864a6d6-841c-4e86-91a2-a0fbc65719ed	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:06:10.293126-03
4eca8cec-2256-4039-96e5-f3ef9e50693e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:08:09.597047-03
27ff9bd9-6279-4bc0-baea-035f3ebc0167	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:10:10.066332-03
43494afc-cebb-4a09-862a-40b3c100b791	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:10:34.709889-03
27ae180a-40ad-489f-b82e-4fd400ae5ae1	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:12:08.270859-03
b9a0e46d-410b-4966-9088-1a29b72437fe	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:14:11.224964-03
0e02f935-b67c-4154-8759-d0ddcc1b304a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:14:11.256147-03
5bd9dfd6-152c-44af-92fa-059e92a4d4cb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:15:34.833806-03
b09c421b-026d-4ac9-969f-58f90074ec2e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:16:09.065293-03
af87acae-f756-43b1-8947-23b6efa3c164	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:18:11.149276-03
ed1b05a1-0500-488a-a1fb-55d02c8fb311	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:18:11.18016-03
01039957-3872-4ee5-a6d6-9bdd18c99a4f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:20:09.411804-03
17d7db67-9a2d-4044-a226-c600ca0ecdea	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:20:34.58825-03
a145c45b-d016-4dcc-b643-3bc7a4103737	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 10:22:35.384511-03
6d55e786-b10d-4cb6-911f-e0766e632ee4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:33:36.52691-03
ecf7e5e8-2a55-4328-9773-334c90ec4f83	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:33:36.594353-03
95ff5529-1de3-4040-bd03-b875fce03a02	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:33:36.770326-03
beea0055-a74a-4b1f-93aa-2eb1385e79c6	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:33:36.822652-03
fa9e2421-3599-447b-8169-bf4fbe135d0f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:35:31.387571-03
44352c1a-d0a6-4d75-b016-8476edc6ceee	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:35:33.724897-03
a2b7dfbd-6994-4afe-9e07-5f895cfb6a57	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:37:31.897384-03
c58eb6e5-c510-4a89-820f-14c6f7530638	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:39:29.608364-03
e8407fbd-0fc3-4883-9c37-24bcc700a538	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:40:33.777334-03
e87e2e16-d38f-4f0e-80ff-1ee26b246ad5	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:41:29.178463-03
4b510ac5-71d6-43b8-9515-70d50841db6c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:43:30.576842-03
725d71ec-b791-4c7d-b390-e6fa3926389c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:45:29.03207-03
9a749642-a545-4f2f-bd63-ce985235c64d	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:45:29.061317-03
faeb048e-9dc0-43f3-883f-40a0c4fd760a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:45:33.813306-03
0f64b495-3d22-4962-a3e4-c1bc30673352	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:47:26.327743-03
ab4e032a-3390-4d23-8b8f-52d84145ff63	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:49:28.553836-03
cb3f704f-565b-4d23-a908-97a711514f62	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:50:35.028922-03
85267e2c-3e45-45ba-a8f9-3af279155a46	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:51:34.046807-03
8d8acefb-e8fb-4201-b063-8d3a10e4a9b9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:53:28.526682-03
c392486f-1a52-4dd6-8f39-7c85125ba2b0	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:53:57.341334-03
7b40686f-cf88-445b-862d-59d9ab7d11c7	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:55:25.673232-03
c277d6de-d142-40cf-9490-70e8303d5106	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:55:34.900904-03
dbf4d393-b3bc-448c-bcf8-4c71c78ef727	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:55:55.186905-03
86d2d147-80eb-4ea7-a03d-63cc704702b2	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:57:26.686898-03
c2a2dbbb-24a7-470c-b368-7b833416221e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:57:56.333839-03
a88f2de7-4e64-4e37-911d-293745385d5f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:58:54.052892-03
ca076302-1f3e-42ff-a418-7e6a98f84207	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:59:26.599123-03
babdf09b-562b-4797-848a-11c12096e9b8	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 14:59:55.278429-03
193b31eb-378d-48ef-94e4-4b1a45705c82	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:00:34.47223-03
0cccc376-7e8a-46b0-81a2-cd4dcf37756d	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:01:26.980888-03
7b6464db-a588-41f4-a6e0-ae200e9a80f9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:01:56.59675-03
7676a101-72eb-4ad6-b690-45d248562d3d	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:03:25.446601-03
4d1022f5-b9f5-466a-8e3f-25e6d81e5952	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:03:55.634504-03
8bb711c1-6f85-44f4-9c24-278664ad1d84	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:05:29.683631-03
7f0e4332-289d-4b4b-9cc4-48496a7bd0b9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:05:29.75774-03
95522272-c59e-41e5-8abf-160fedf61bff	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:05:33.500534-03
a2164c40-8f00-46b0-a5af-e0cfd0f047b4	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:05:57.687652-03
b728d837-e4eb-49d7-a9f4-358f8fd0217a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:07:29.67057-03
d63d3ce6-1f0a-404c-9794-9045d0386cba	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:07:55.13409-03
b4f3bf35-c119-476c-a9e7-880d4de03a73	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:08:59.197976-03
0707335c-e9c4-459a-8018-6fa0e6805456	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:09:30.370257-03
7068932d-4403-435d-ae10-48ef9ac5dd9e	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:09:30.384714-03
03d30421-69ab-43e7-97fc-dc1522d2f018	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:09:54.232205-03
e4e2981f-f4e2-4e0a-a600-1685bfb1dbfd	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:10:35.484982-03
b360fd06-187d-47c6-a08c-2190400b2c4c	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:11:29.508044-03
7f3055cf-a174-4220-82fd-4b256ed8725a	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:11:55.276659-03
63422d71-0ea1-438b-9c0a-6dbacecf7bf0	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:13:26.945957-03
cf9d922e-9e43-406f-b6f9-d0d75e607f25	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:13:57.106809-03
bb6c26a5-95c6-46cf-b4b7-7416eba9e848	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:15:31.000559-03
d36c8095-5d55-40da-bc11-40301ad1ec7d	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:15:34.105676-03
75fbdeb9-cf0c-44fa-af6c-802c083517bb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:15:57.440695-03
bdeebf9d-632b-462d-a619-566bc94630f3	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:15:57.469186-03
0ac521b7-c6c9-46be-ba79-940f3e8f5add	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:17:27.047803-03
a3ae8d7e-d3d4-4580-a9a5-0a4db3e88858	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:17:55.10667-03
646ea775-7b0d-40da-aef7-cfd7534933cb	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:18:53.841683-03
5037ee65-e6b5-469a-99eb-881db104bae2	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:19:26.554803-03
824b463e-3cc3-4820-b53b-68cdc35db6ce	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:19:54.233748-03
c4f8ac4d-7461-4fe0-af1e-86c2a9f2a872	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:20:34.916639-03
e1adc398-3445-4d98-b961-fc486fbfc9a2	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:59:58.712012-03
e0555362-5fe6-4ab1-9ff7-c25a51afe542	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 15:59:59.686648-03
c562b232-2da1-437e-a3ea-967c10cd3b66	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 16:00:00.258726-03
3883282f-e122-48db-882a-d5b849d227c5	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 16:00:01.628393-03
1fbd0241-1c98-4abe-83be-aa42ccf4cca9	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 16:00:01.846538-03
3780e203-18c8-467e-bffa-380913354003	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 16:00:02.116472-03
7b69fb8f-da80-4397-9266-9792d84d136f	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 16:00:34.795009-03
ffef12f5-e7dd-45e1-a661-8d1ba4a4debd	df504f2f-7059-4bc2-af90-0584c559138f	-21.42690000	-50.08160000	\N	\N	\N	2026-01-14 16:01:26.431293-03
\.


--
-- Data for Name: computer_monitors; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_monitors (id, computer_id, manufacturer, model, serial_number, week_of_manufacture, year_of_manufacture, created_at, updated_at) FROM stdin;
2c737ef6-b9a2-4039-a814-ba6067086849	df504f2f-7059-4bc2-af90-0584c559138f	CMN	\N	0	15	2017	2026-01-14 16:01:26.38619-03	2026-01-14 16:01:26.38619-03
\.


--
-- Data for Name: computer_policies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_policies (id, organization_id, group_id, user_id, blocked_sites, inactivity_time_minutes, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: computer_printers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_printers (id, computer_id, name, port, is_default, is_network, is_shared, status, created_at, updated_at) FROM stdin;
daf740e5-fd9f-4e03-bf0e-65a79c87d684	df504f2f-7059-4bc2-af90-0584c559138f	ZDesigner ZD220-203dpi ZPL	USB005	t	f	f	Unknown	2026-01-14 16:01:26.402239-03	2026-01-14 16:01:26.402239-03
90031b5a-2a23-4d8d-8387-6b90fcf38664	df504f2f-7059-4bc2-af90-0584c559138f	OneNote (Desktop)	nul:	f	f	f	Unknown	2026-01-14 16:01:26.407795-03	2026-01-14 16:01:26.407795-03
756448ee-0be7-4f34-9ddb-fcbf19c91362	df504f2f-7059-4bc2-af90-0584c559138f	Microsoft Print to PDF	PORTPROMPT:	f	f	f	Unknown	2026-01-14 16:01:26.41191-03	2026-01-14 16:01:26.41191-03
7d254cc6-193b-4b2c-bc6d-75af1a6d522a	df504f2f-7059-4bc2-af90-0584c559138f	HPBCE92FAB2801(HP Laser MFP 131 133 135-138)	WSD-d2434164-f241-4b4b-be96-5ebf884db0db	f	f	f	Unknown	2026-01-14 16:01:26.416098-03	2026-01-14 16:01:26.416098-03
97f4ceb0-a5e6-4e01-8581-9c7160038aed	df504f2f-7059-4bc2-af90-0584c559138f	HP4BA251	WSD-17f5d575-be8a-47e8-ac11-ddc21ea76d3b	f	f	f	Unknown	2026-01-14 16:01:26.419652-03	2026-01-14 16:01:26.419652-03
8d2abbb6-4e39-4ed0-ab34-27a53accf8d8	df504f2f-7059-4bc2-af90-0584c559138f	HP4B1B78	WSD-52944b0f-513b-4c33-bab2-7027654c49eb	f	f	f	Unknown	2026-01-14 16:01:26.423483-03	2026-01-14 16:01:26.423483-03
\.


--
-- Data for Name: computer_restrictions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_restrictions (id, computer_id, camera_disabled, screen_capture_disabled, bluetooth_disabled, usb_data_transfer_disabled, wifi_disabled, factory_reset_disabled, safe_boot_disabled, status_bar_disabled, usb_devices_blocked, cd_rom_disabled, printer_install_disabled, remote_desktop_disabled, created_at, updated_at) FROM stdin;
70cf9ba7-1317-4e3d-8449-aeaa9a304827	df504f2f-7059-4bc2-af90-0584c559138f	f	f	f	f	f	t	t	f	f	f	f	f	2026-01-08 15:23:07.107127-03	2026-03-10 08:48:54.536121-03
\.


--
-- Data for Name: computer_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_status_history (id, computer_id, status_date, status, online_count, last_online_time, created_at, updated_at) FROM stdin;
5424	4db51631-0e73-41f6-9708-8c98ee0d5e5b	2025-12-03	online	155	2025-12-03 16:18:56.527235	2025-12-03 15:06:27.40323	2025-12-03 16:18:56.527235
2005	12cb9157-1157-4416-a8f7-f9ab8c9a2561	2025-11-21	online	7	2025-11-21 07:01:20.629764	2025-11-21 06:37:58.097669	2025-11-21 07:08:47.905746
2086	6ca05cd7-5a5d-4c49-ab82-53504b2f6afb	2025-11-21	online	162	2025-11-21 17:47:55.275179	2025-11-21 08:35:09.468981	2025-11-21 17:47:55.275179
3686	0aa3d2c2-966d-4494-ab53-737722d3a6af	2025-11-27	online	88	2025-11-27 07:10:13.515725	2025-11-27 06:28:51.287089	2025-11-27 07:10:57.811706
2947	1dac2182-dfad-4cd1-8db3-a01d19034fba	2025-11-26	online	643	2025-11-26 14:14:49.020684	2025-11-26 06:07:18.794066	2025-11-26 14:15:33.053055
8042	f5b74ddf-394f-4b94-8deb-c31221d128fb	2025-12-09	online	989	2025-12-09 15:58:54.172335	2025-12-09 06:04:47.324131	2025-12-09 15:58:54.172335
5598	f5b74ddf-394f-4b94-8deb-c31221d128fb	2025-12-04	online	758	2025-12-04 16:28:53.136286	2025-12-04 07:03:36.64522	2025-12-04 16:28:56.758992
2750	1dac2182-dfad-4cd1-8db3-a01d19034fba	2025-11-25	online	197	2025-11-25 15:20:02.477035	2025-11-25 06:24:24.688807	2025-11-25 15:20:02.477035
1219	9247-1692-4312-9697-1706-8166-81	2025-11-17	online	37	2025-11-17 11:38:06.754785	2025-11-17 10:05:00.849334	2025-11-17 11:52:19.832894
1	7510-5065-8331-1117-4495-5314-12	2025-11-12	online	190	2025-11-12 15:04:42.569384	2025-11-12 11:25:01.568686	2025-11-12 15:04:57.281089
14278	37b48033-04d9-4a36-8e76-7a13197810dd	2025-12-23	online	1923	2025-12-23 16:05:35.196386	2025-12-23 06:23:08.2373	2025-12-23 16:06:21.085582
2248	6ca05cd7-5a5d-4c49-ab82-53504b2f6afb	2025-11-24	online	10	2025-11-24 06:43:19.245403	2025-11-24 06:27:24.234933	2025-11-24 06:49:04.479808
1169	7510-5065-8331-1117-4495-5314-12	2025-11-17	online	50	2025-11-17 07:39:59.811337	2025-11-17 06:38:55.752853	2025-11-17 07:41:56.978274
978	7510-5065-8331-1117-4495-5314-12	2025-11-14	online	191	2025-11-14 08:25:44.030824	2025-11-14 06:24:02.613065	2025-11-14 08:25:44.030824
1256	fb74e8e6cf7a1263	2025-11-17	online	259	2025-11-17 15:05:22.216619	2025-11-17 11:52:24.417298	2025-11-17 15:05:22.216619
1515	fb74e8e6cf7a1263	2025-11-18	online	1	2025-11-18 11:03:05.970826	2025-11-18 11:03:05.970826	2025-11-18 11:03:06.090879
6357	f5b74ddf-394f-4b94-8deb-c31221d128fb	2025-12-05	online	961	2025-12-05 16:17:41.592588	2025-12-05 06:17:35.016816	2025-12-05 16:17:41.592588
12581	37b48033-04d9-4a36-8e76-7a13197810dd	2025-12-19	online	721	2025-12-19 16:06:04.502689	2025-12-19 09:14:11.096255	2025-12-19 16:06:24.390375
4214	4db51631-0e73-41f6-9708-8c98ee0d5e5b	2025-11-28	online	630	2025-11-28 15:15:40.446773	2025-11-28 05:03:41.573709	2025-11-28 15:15:40.446773
4971	4db51631-0e73-41f6-9708-8c98ee0d5e5b	2025-12-02	online	453	2025-12-02 15:00:44.588802	2025-12-02 07:40:13.030648	2025-12-02 15:01:23.608186
191	7510-5065-8331-1117-4495-5314-12	2025-11-13	online	787	2025-11-13 15:14:09.187299	2025-11-13 06:03:10.698344	2025-11-13 15:14:09.187299
3774	1244f2a6-5ee0-4bf6-b1f9-ae9e5d2533c9	2025-11-27	online	18	2025-11-27 07:25:58.26256	2025-11-27 07:17:59.380922	2025-11-27 07:26:21.174756
1516	618b4479-da36-4818-a156-315eeb55313d	2025-11-18	online	9	2025-11-18 15:05:36.704349	2025-11-18 14:26:27.414467	2025-11-18 15:05:36.704349
10020	f5b74ddf-394f-4b94-8deb-c31221d128fb	2025-12-11	online	513	2025-12-11 14:59:54.322033	2025-12-11 06:11:30.849452	2025-12-11 15:00:10.966645
3792	4db51631-0e73-41f6-9708-8c98ee0d5e5b	2025-11-27	online	422	2025-11-27 17:07:29.596665	2025-11-27 07:28:06.258496	2025-11-27 17:07:29.596665
1525	618b4479-da36-4818-a156-315eeb55313d	2025-11-19	online	57	2025-11-19 15:09:14.283812	2025-11-19 06:05:37.240236	2025-11-19 15:09:14.283812
1529	12cb9157-1157-4416-a8f7-f9ab8c9a2561	2025-11-19	online	423	2025-11-19 15:09:13.802873	2025-11-19 06:34:54.057173	2025-11-19 15:15:00.453747
10021	618b4479-da36-4818-a156-315eeb55313d	2025-12-11	online	476	2025-12-11 14:24:55.771499	2025-12-11 06:11:30.865046	2025-12-11 14:25:04.557905
3590	0aa3d2c2-966d-4494-ab53-737722d3a6af	2025-11-26	online	96	2025-11-26 15:19:24.019346	2025-11-26 14:16:47.524684	2025-11-26 15:19:24.019346
2012	de36be2c-800a-499c-8ba7-3196a11d37f1	2025-11-21	online	74	2025-11-21 08:33:48.090084	2025-11-21 07:10:12.632759	2025-11-21 08:33:49.901381
16620	5a48caea-6c44-48d3-96bb-4fa8c35399e4	2025-12-26	online	17	2025-12-26 10:21:17.557578	2025-12-26 10:16:25.69791	2025-12-26 10:21:38.583442
2258	1dac2182-dfad-4cd1-8db3-a01d19034fba	2025-11-24	online	492	2025-11-24 15:09:38.940718	2025-11-24 06:49:59.821778	2025-11-24 15:10:56.886923
4845	4db51631-0e73-41f6-9708-8c98ee0d5e5b	2025-12-01	online	125	2025-12-01 08:22:41.596133	2025-12-01 06:19:21.20739	2025-12-01 08:23:39.727928
11480	618b4479-da36-4818-a156-315eeb55313d	2025-12-15	online	586	2025-12-15 16:17:56.439117	2025-12-15 06:06:48.187127	2025-12-15 16:17:56.439117
12067	618b4479-da36-4818-a156-315eeb55313d	2025-12-16	offline	0	\N	2025-12-16 06:15:02.318852	2025-12-16 06:15:02.318852
11011	618b4479-da36-4818-a156-315eeb55313d	2025-12-12	online	441	2025-12-12 17:59:57.885088	2025-12-12 10:27:23.333522	2025-12-12 17:59:57.885088
8809	618b4479-da36-4818-a156-315eeb55313d	2025-12-09	online	100	2025-12-09 15:46:48.079907	2025-12-09 14:03:01.228275	2025-12-09 15:47:42.490702
5579	4db51631-0e73-41f6-9708-8c98ee0d5e5b	2025-12-04	online	18	2025-12-04 06:38:21.412142	2025-12-04 06:26:53.109041	2025-12-04 06:39:00.298203
7318	f5b74ddf-394f-4b94-8deb-c31221d128fb	2025-12-08	online	723	2025-12-08 16:17:02.254343	2025-12-08 06:27:58.944393	2025-12-08 16:17:29.484201
12068	f5b74ddf-394f-4b94-8deb-c31221d128fb	2025-12-17	online	375	2025-12-17 15:11:26.251348	2025-12-17 09:41:17.149722	2025-12-17 15:11:54.057317
12573	f144de9a-d6ae-4dee-b482-d1189a91edfc	2025-12-19	online	7	2025-12-19 07:33:42.064652	2025-12-19 07:31:36.131598	2025-12-19 07:34:06.11666
9160	618b4479-da36-4818-a156-315eeb55313d	2025-12-10	online	409	2025-12-10 16:17:05.45962	2025-12-10 06:55:34.913996	2025-12-10 16:17:05.45962
9132	f5b74ddf-394f-4b94-8deb-c31221d128fb	2025-12-10	online	478	2025-12-10 16:17:08.075308	2025-12-10 06:06:50.553534	2025-12-10 16:17:08.075308
16889	f60886d2-7e78-4a81-81fd-50e4a15b3720	2025-12-26	online	20	2025-12-26 14:00:09.412813	2025-12-26 13:55:17.473737	2025-12-26 14:00:13.089265
16201	37b48033-04d9-4a36-8e76-7a13197810dd	2025-12-24	online	121	2025-12-24 10:12:03.2155	2025-12-24 06:26:20.74306	2025-12-24 10:50:10.292179
12530	f5b74ddf-394f-4b94-8deb-c31221d128fb	2025-12-18	online	42	2025-12-18 16:01:06.338922	2025-12-18 15:20:55.796058	2025-12-18 16:01:08.203221
12366	618b4479-da36-4818-a156-315eeb55313d	2025-12-17	online	86	2025-12-17 16:31:01.299481	2025-12-17 14:34:55.293191	2025-12-17 16:31:01.299481
12529	618b4479-da36-4818-a156-315eeb55313d	2025-12-18	offline	0	\N	2025-12-18 06:09:54.306608	2025-12-18 06:09:54.306608
16430	918a70ff-45a0-4a52-842c-ef188f4a0100	2025-12-26	online	189	2025-12-26 10:14:59.718322	2025-12-26 09:01:36.223736	2025-12-26 10:15:06.748476
13303	37b48033-04d9-4a36-8e76-7a13197810dd	2025-12-22	online	975	2025-12-22 16:16:46.950225	2025-12-22 06:43:05.424111	2025-12-22 16:17:23.089557
16322	244a2711-9e06-46ae-b1b9-413d3785c924	2025-12-26	online	107	2025-12-26 08:59:59.568372	2025-12-26 08:30:06.546419	2025-12-26 09:00:18.003736
16638	0496fa21-64bb-47dd-b1b1-4fb0a1aac0ca	2025-12-26	online	166	2025-12-26 11:09:51.658343	2025-12-26 10:22:58.00889	2025-12-26 11:10:11.945178
16805	d3d33481-9a3d-42b1-ab79-4e10daf9fedd	2025-12-26	offline	0	\N	2025-12-26 11:11:16.994631	2025-12-26 11:11:16.994631
16947	581ba186-b8e9-43f9-9a62-400937f4a189	2025-12-26	online	184	2025-12-26 15:00:16.976678	2025-12-26 14:13:23.104481	2025-12-26 15:01:17.651916
16806	edcad4d8-f659-4108-bdc2-8c835fb8462c	2025-12-26	online	82	2025-12-26 13:53:43.531782	2025-12-26 13:32:51.579647	2025-12-26 13:53:58.571777
16910	79446b03-1da0-48c0-ad78-bfb9f873512b	2025-12-26	online	36	2025-12-26 14:10:24.585679	2025-12-26 14:01:32.640099	2025-12-26 14:10:54.243317
17263	3dfef3b3-43e9-4481-ac0f-d4e6e6564a0f	2025-12-29	online	7	2025-12-29 08:16:19.805793	2025-12-29 08:15:11.687742	2025-12-29 08:16:36.068479
17132	a0af372e-27ff-4549-9a24-15fceed880d1	2025-12-26	online	130	2025-12-26 15:37:30.155856	2025-12-26 15:05:07.606409	2025-12-26 15:41:21.184519
17760	c31cd5f0-86f5-4443-8500-d4568d0f5c34	2025-12-30	offline	0	\N	2025-12-30 06:23:08.794365	2025-12-30 06:23:08.794365
17270	9f364d2b-e0e5-4e47-be31-40bac81f69b6	2025-12-29	online	239	2025-12-29 12:03:02.340687	2025-12-29 08:17:55.171804	2025-12-29 12:03:17.541615
17510	c31cd5f0-86f5-4443-8500-d4568d0f5c34	2025-12-29	online	250	2025-12-29 17:06:05.742974	2025-12-29 12:06:45.391442	2025-12-29 17:06:48.527114
17761	7d149077-375d-47c3-ab19-aee3f2758997	2025-12-30	online	140	2025-12-30 13:13:02.90305	2025-12-30 10:45:23.868458	2025-12-30 13:13:40.200618
17902	5889dee3-b7da-41b1-ae34-08cef8ebd8a4	2025-12-31	online	103	2025-12-31 11:19:32.807763	2025-12-31 10:18:53.035313	2025-12-31 11:19:32.807763
18437	2fe50245-786b-447f-9a07-1259df91008d	2026-01-05	online	330	2026-01-05 14:51:08.810128	2026-01-05 11:32:08.981778	2026-01-05 14:51:51.979375
18235	2c800bf1-e512-415a-a136-89df6e469b73	2026-01-05	online	182	2026-01-05 11:18:42.699409	2026-01-05 09:41:57.005206	2026-01-05 11:21:54.098717
18417	cb913a90-4436-4b47-adb0-1c5edc7c0099	2026-01-05	online	14	2026-01-05 11:31:18.734457	2026-01-05 11:24:11.635746	2026-01-05 11:31:33.493524
18005	5889dee3-b7da-41b1-ae34-08cef8ebd8a4	2026-01-05	online	235	2026-01-05 11:29:55.87084	2026-01-05 06:18:17.743762	2026-01-05 11:30:18.048871
19679	helper-63e4e18f-a0f8-4ec4-9c6d-ba5149f22e1b-desktop_63e4e18f-a0f8-4ec4-9c6d-ba5149f22e1b_1767865414311_jgtydaqcr	2026-01-08	offline	0	\N	2026-01-08 06:45:29.4258	2026-01-08 06:45:29.4258
19611	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767809976368_0weorlfwt	2026-01-07	offline	0	\N	2026-01-07 15:19:42.086237	2026-01-07 15:19:42.086237
19612	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810059857_bm2k61h7w	2026-01-07	offline	0	\N	2026-01-07 15:21:03.957946	2026-01-07 15:21:03.957946
19648	9e497193-5cda-4062-9cb6-ece106a4c7c7	2026-01-07	online	10	2026-01-07 16:07:15.485341	2026-01-07 15:55:15.299459	2026-01-07 16:08:52.92101
19634	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767811191479_45k8vpdeh	2026-01-07	offline	0	\N	2026-01-07 15:40:40.818931	2026-01-07 15:40:40.818931
19635	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767811243965_os1vd1d0a	2026-01-07	offline	0	\N	2026-01-07 15:42:00.765465	2026-01-07 15:42:00.765465
19695	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767866399571_ywxdxdkem	2026-01-08	offline	0	\N	2026-01-08 07:01:59.75207	2026-01-08 07:06:41.395621
19617	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810279923_6f9op8ylz	2026-01-07	offline	0	\N	2026-01-07 15:25:17.141774	2026-01-07 15:25:17.141774
19618	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810290894_o7m8ts3ir	2026-01-07	offline	0	\N	2026-01-07 15:25:31.850421	2026-01-07 15:25:31.850421
19619	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810351826_xcy98flcv	2026-01-07	offline	0	\N	2026-01-07 15:25:54.423652	2026-01-07 15:25:54.423652
19591	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767807683096_is00lsxza	2026-01-07	offline	0	\N	2026-01-07 14:43:23.445945	2026-01-07 15:04:51.140077
19592	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767807700804_cjvsx154g	2026-01-07	offline	0	\N	2026-01-07 14:43:40.910515	2026-01-07 15:04:51.199828
19590	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767807656503_72a3nr3qt	2026-01-07	offline	0	\N	2026-01-07 14:42:56.693754	2026-01-07 15:04:51.200788
19405	308d551d-03a2-4e3e-9b81-21cc29caf570	2026-01-07	online	42	2026-01-07 09:10:56.057616	2026-01-07 08:06:04.216833	2026-01-07 09:12:34.337975
19661	8709aed9-559b-40c8-b0a6-3d0677f41f24	2026-01-08	online	11	2026-01-08 06:33:54.94578	2026-01-08 06:22:03.512747	2026-01-08 06:35:27.92681
19598	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767809116926_uz0o1yw0d	2026-01-07	offline	0	\N	2026-01-07 15:06:01.582547	2026-01-07 15:06:01.582547
19599	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767809162629_3l0qpr3or	2026-01-07	offline	0	\N	2026-01-07 15:06:09.572243	2026-01-07 15:06:09.572243
19461	aff0fd70-2a91-4706-8aab-cae498940cf9	2026-01-07	online	163	2026-01-07 15:52:34.154432	2026-01-07 09:39:55.592689	2026-01-07 15:52:41.445636
19621	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810355374_3n353067m	2026-01-07	offline	0	\N	2026-01-07 15:27:25.175531	2026-01-07 15:27:25.175531
19601	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767809301078_jk8j901ch	2026-01-07	offline	0	\N	2026-01-07 15:08:38.797579	2026-01-07 15:08:38.797579
19639	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767811493333_p15dgkj3l	2026-01-07	offline	0	\N	2026-01-07 15:45:16.957837	2026-01-07 15:45:16.957837
18878	b179979f-a686-495e-b8aa-e13adf7c2014	2026-01-06	online	24	2026-01-06 06:29:41.241141	2026-01-06 06:16:40.403843	2026-01-06 06:29:51.132397
19640	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767811517715_ye0nfsw8m	2026-01-07	offline	0	\N	2026-01-07 15:45:19.495472	2026-01-07 15:45:19.495472
18902	2c7ab5dd-75a9-454e-817f-9f0288f711ad	2026-01-06	online	192	2026-01-06 09:20:21.282184	2026-01-06 07:03:14.583333	2026-01-06 09:22:18.804935
19658	1142dfc1-f4a8-45a5-b363-391f7a3b0789	2026-01-07	online	3	2026-01-07 16:14:50.314157	2026-01-07 16:10:50.377579	2026-01-07 16:15:47.860209
19624	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810612835_owybd9b7z	2026-01-07	offline	0	\N	2026-01-07 15:30:18.018915	2026-01-07 15:30:18.018915
19625	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810621466_szx2itgn6	2026-01-07	offline	0	\N	2026-01-07 15:30:29.501283	2026-01-07 15:30:29.501283
19626	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810630409_8l8ysmt4e	2026-01-07	offline	0	\N	2026-01-07 15:30:37.938511	2026-01-07 15:30:37.938511
19102	d6466624-1fe0-40bd-b499-4ca73963dd84	2026-01-06	online	194	2026-01-06 15:02:51.291299	2026-01-06 09:41:28.892046	2026-01-06 15:04:03.79842
19094	5f6c983f-abcb-431b-bc0b-abe1912cb48d	2026-01-06	online	5	2026-01-06 09:38:38.002325	2026-01-06 09:32:38.091541	2026-01-06 09:39:55.594788
19290	e34326e9-bbae-4c6c-8fb4-8fe4e470a6dc	2026-01-06	online	4	2026-01-06 15:01:08.922933	2026-01-06 14:56:09.707023	2026-01-06 15:04:51.269036
19099	5f6c883f-abcb-431b-bc0b-abe1912cb48d	2026-01-06	online	2	2026-01-06 09:40:34.090611	2026-01-06 09:40:29.075143	2026-01-06 09:41:10.176302
18854	b179979f-a686-495e-b8aa-e13adf7c2014	2026-01-05	online	24	2026-01-05 16:17:52.13277	2026-01-05 15:46:22.336766	2026-01-05 16:18:11.807079
19628	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767810639114_sin9x91yr	2026-01-07	offline	0	\N	2026-01-07 15:31:14.872699	2026-01-07 15:31:14.872699
19708	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767867093700_ac0h93lve	2026-01-08	offline	0	\N	2026-01-08 07:11:37.440533	2026-01-08 07:11:37.440533
19609	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767809929893_f3fzcf08x	2026-01-07	offline	0	\N	2026-01-07 15:19:31.088362	2026-01-07 15:19:31.088362
19690	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767866371574_x93tqc7mg	2026-01-08	offline	0	\N	2026-01-08 06:59:58.042268	2026-01-08 06:59:58.042268
19447	ecf37f2c-d4a9-4201-82a6-6dc4a7199bbf	2026-01-07	online	14	2026-01-07 09:37:28.018185	2026-01-07 09:19:25.075778	2026-01-07 09:38:02.487438
19630	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767811130869_vonbxo6ur	2026-01-07	offline	0	\N	2026-01-07 15:39:28.804375	2026-01-07 15:39:28.804375
19631	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767811169618_p5vmo25qv	2026-01-07	offline	0	\N	2026-01-07 15:39:50.072865	2026-01-07 15:39:50.072865
19705	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767866801328_sijp4i99n	2026-01-08	offline	0	\N	2026-01-08 07:08:41.447204	2026-01-08 07:10:05.046335
19672	63e4e18f-a0f8-4ec4-9c6d-ba5149f22e1b	2026-01-08	online	7	2026-01-08 06:45:01.47631	2026-01-08 06:38:03.647639	2026-01-08 06:45:29.370406
19586	helper-aff0fd70-2a91-4706-8aab-cae498940cf9-desktop_aff0fd70-2a91-4706-8aab-cae498940cf9_1767807436222_u1wi4bmvn	2026-01-07	offline	0	\N	2026-01-07 14:38:21.489081	2026-01-07 14:38:21.489081
19709	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767867098525_9xqc7vnaz	2026-01-08	offline	0	\N	2026-01-08 07:11:55.463671	2026-01-08 07:11:55.463671
18767	5ee0db50-6232-4558-9ff2-efdd7a170319	2026-01-05	online	87	2026-01-05 15:45:05.564024	2026-01-05 14:53:01.283531	2026-01-05 15:45:35.144316
19343	3a28a492-cc9d-4c91-8d61-7ef441ddca6d	2026-01-07	online	62	2026-01-07 07:47:56.370144	2026-01-07 06:22:07.318131	2026-01-07 07:49:43.838498
19300	9506a461-5682-4957-adfc-37f7382fb31d	2026-01-06	online	42	2026-01-06 16:18:25.317867	2026-01-06 15:18:45.19836	2026-01-06 16:18:25.317867
19342	9506a461-5682-4957-adfc-37f7382fb31d	2026-01-07	offline	0	\N	2026-01-07 06:06:41.331631	2026-01-07 06:06:41.331631
19723	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767867749758_3um7xgijg	2026-01-08	offline	0	\N	2026-01-08 07:23:04.71543	2026-01-08 07:23:04.71543
19712	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767867116630_rx0tixjpb	2026-01-08	offline	0	\N	2026-01-08 07:13:56.802139	2026-01-08 07:14:29.202235
20107	7611a307-c116-41fb-bdda-cf119f8356c3	2026-01-13	online	3	2026-01-13 18:12:26.801425	2026-01-13 18:12:16.722429	2026-01-13 18:12:26.801425
19925	helper-7611a307-c116-41fb-bdda-cf119f8356c3-desktop_7611a307-c116-41fb-bdda-cf119f8356c3_1767949443617_gjuxp4o0q	2026-01-09	offline	0	\N	2026-01-09 06:04:05.13435	2026-01-09 06:04:05.13435
19952	helper-7611a307-c116-41fb-bdda-cf119f8356c3-desktop_7611a307-c116-41fb-bdda-cf119f8356c3_1767950924774_2g4gxw6yl	2026-01-09	offline	0	\N	2026-01-09 06:29:00.611452	2026-01-09 06:29:00.611452
19725	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767867763235_wksjee0f9	2026-01-08	offline	0	\N	2026-01-08 07:24:43.414942	2026-01-08 07:26:34.715806
19730	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868022132_vurqhnsxk	2026-01-08	offline	0	\N	2026-01-08 07:27:05.73985	2026-01-08 07:27:05.73985
19731	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868041872_r2qayb8db	2026-01-08	offline	0	\N	2026-01-08 07:27:40.201135	2026-01-08 07:27:40.201135
19953	helper-7611a307-c116-41fb-bdda-cf119f8356c3-desktop_7611a307-c116-41fb-bdda-cf119f8356c3_1767950941469_op4cumkrf	2026-01-09	offline	0	\N	2026-01-09 06:29:19.69568	2026-01-09 06:29:19.69568
19954	helper-7611a307-c116-41fb-bdda-cf119f8356c3-desktop_7611a307-c116-41fb-bdda-cf119f8356c3_1767950976310_t4u3loupl	2026-01-09	offline	0	\N	2026-01-09 06:30:07.107511	2026-01-09 06:30:07.107511
19770	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767870354263_pkqb4i4je	2026-01-08	offline	0	\N	2026-01-08 08:05:55.555047	2026-01-08 08:05:55.555047
19734	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868062529_oz36bz9t5	2026-01-08	offline	0	\N	2026-01-08 07:29:42.699021	2026-01-08 07:30:07.544176
20111	7611a307-c116-41fb-bdda-cf119f8356c3	2026-01-14	online	177	2026-01-14 16:01:26.438505	2026-01-14 07:56:46.237599	2026-01-14 16:01:26.438505
19833	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767876007705_onxl8ytoa	2026-01-08	offline	0	\N	2026-01-08 09:40:09.380491	2026-01-08 09:40:09.380491
19739	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868280550_7c02vkgmt	2026-01-08	offline	0	\N	2026-01-08 07:31:23.552298	2026-01-08 07:31:23.552298
19680	2c6d3b85-3159-4eab-9c8a-986ce2c26054	2026-01-08	online	183	2026-01-08 13:29:25.127822	2026-01-08 06:47:07.875892	2026-01-08 13:30:02.974606
19835	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767876084824_wbjhx73re	2026-01-08	offline	0	\N	2026-01-08 09:41:26.027409	2026-01-08 09:41:26.027409
19886	helper-576f6293-2592-4690-8efc-bea457b66101-desktop_576f6293-2592-4690-8efc-bea457b66101_1767896312795_my113xvlf	2026-01-08	offline	0	\N	2026-01-08 15:18:34.42994	2026-01-08 15:18:34.42994
19744	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868536920_e4h6q9o0s	2026-01-08	offline	0	\N	2026-01-08 07:36:00.940051	2026-01-08 07:36:00.940051
19745	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868562296_ls3txo90p	2026-01-08	offline	0	\N	2026-01-08 07:36:11.210173	2026-01-08 07:36:11.210173
19747	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868592421_v065n4rm3	2026-01-08	offline	0	\N	2026-01-08 07:36:33.573253	2026-01-08 07:36:33.573253
19780	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767871100561_0jtjxzixl	2026-01-08	offline	0	\N	2026-01-08 08:18:22.960085	2026-01-08 08:18:22.960085
19888	helper-576f6293-2592-4690-8efc-bea457b66101-desktop_576f6293-2592-4690-8efc-bea457b66101_1767896410125_wl16yvz5y	2026-01-08	offline	0	\N	2026-01-08 15:20:11.021551	2026-01-08 15:20:11.021551
20272	helper-7611a307-c116-41fb-bdda-cf119f8356c3-desktop_7611a307-c116-41fb-bdda-cf119f8356c3_1768414428040_ggks5y6uo	2026-01-14	offline	0	\N	2026-01-14 15:15:49.338703	2026-01-14 15:59:43.35062
19911	helper-7611a307-c116-41fb-bdda-cf119f8356c3-desktop_7611a307-c116-41fb-bdda-cf119f8356c3_1767897869195_o8y8jjj6l	2026-01-08	offline	0	\N	2026-01-08 15:44:29.405028	2026-01-08 15:44:29.405028
19752	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868793698_2a7okfq7v	2026-01-08	offline	0	\N	2026-01-08 07:39:55.016982	2026-01-08 07:39:55.016982
19753	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767868789526_yjfm93y9g	2026-01-08	offline	0	\N	2026-01-08 07:40:38.528078	2026-01-08 07:40:38.528078
19885	576f6293-2592-4690-8efc-bea457b66101	2026-01-08	online	4	2026-01-08 15:22:07.062943	2026-01-08 15:18:06.602915	2026-01-08 15:22:13.945782
19913	helper-7611a307-c116-41fb-bdda-cf119f8356c3-desktop_7611a307-c116-41fb-bdda-cf119f8356c3_1767899273950_o6z6r6izy	2026-01-08	offline	0	\N	2026-01-08 16:07:56.147325	2026-01-08 16:07:56.147325
19843	helper-2c6d3b85-3159-4eab-9c8a-986ce2c26054-desktop_2c6d3b85-3159-4eab-9c8a-986ce2c26054_1767876684128_efnb6lt5y	2026-01-08	offline	0	\N	2026-01-08 09:51:25.8755	2026-01-08 09:51:25.8755
19893	helper-7611a307-c116-41fb-bdda-cf119f8356c3-desktop_7611a307-c116-41fb-bdda-cf119f8356c3_1767896595779_0h6iq88lz	2026-01-08	offline	0	\N	2026-01-08 15:23:17.282285	2026-01-08 15:23:17.282285
19921	7611a307-c116-41fb-bdda-cf119f8356c3	2026-01-09	online	156	2026-01-09 09:17:16.540018	2026-01-09 06:03:16.313214	2026-01-09 09:17:16.540018
19889	7611a307-c116-41fb-bdda-cf119f8356c3	2026-01-08	online	27	2026-01-08 16:13:42.197553	2026-01-08 15:20:39.227751	2026-01-08 16:13:42.197553
\.


--
-- Data for Name: computer_storage_drives; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computer_storage_drives (id, computer_id, drive, label, file_system, total, used, free, created_at, updated_at) FROM stdin;
0b0da362-f1e3-4894-88c0-c3f97dd2aa71	df504f2f-7059-4bc2-af90-0584c559138f	C:	\N	NTFS	511210156032	371788615680	139421540352	2026-03-10 08:48:54.041988-03	2026-03-10 08:48:54.041988-03
\.


--
-- Data for Name: computers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.computers (id, organization_id, computer_id, name, hostname, domain, os_type, os_version, os_build, architecture, cpu_model, cpu_cores, cpu_threads, memory_total, memory_used, storage_total, storage_used, ip_address, mac_address, network_type, wifi_ssid, is_wifi_enabled, is_bluetooth_enabled, agent_version, agent_installed_at, last_heartbeat, logged_in_user, assigned_device_user_id, compliance_status, antivirus_installed, antivirus_enabled, antivirus_name, firewall_enabled, encryption_enabled, latitude, longitude, location_accuracy, last_location_update, status, last_seen, created_at, updated_at, location_address, location_source, processor_arch, memory_slots, os_description, os_edition, manufacturer, model, serial, install_date, last_boot_up_time) FROM stdin;
df504f2f-7059-4bc2-af90-0584c559138f	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	7611a307-c116-41fb-bdda-cf119f8356c3	CSSPNOT0038	CSSPNOT0038	\N	Windows	10.0.26200.7840 Build 26200.7840	10.0.26200.7840 Build 26200.7840	x64	12th Gen Intel(R) Core(TM) i5-12450H	12	12	16869548032	12836728832	511210156032	371788615680	192.168.2.83	24:B2:B9:0D:84:CD	Wi-Fi	client	t	f	\N	\N	2026-03-10 08:48:57.757989-03	\N	\N	unknown	t	t	Windows Defender	f	f	\N	\N	\N	\N	offline	2026-03-10 08:48:57.757989-03	2026-01-08 15:23:06.833555-03	2026-03-10 08:48:57.757989-03	\N	\N	\N	[{"type": "DDR4", "speed": 3200, "capacity": 8589934592, "bankLabel": "BANK 0", "formFactor": "SODIMM", "partNumber": "SMS4WEC3C1J0446SAG", "manufacturer": "0x0F94", "serialNumber": "06B4BE22", "deviceLocator": "Controller0-ChannelA-DIMM0"}, {"type": "DDR4", "speed": 3200, "capacity": 8589934592, "bankLabel": "BANK 0", "formFactor": "SODIMM", "partNumber": "SMS4WEC3C1J0446SAG", "manufacturer": "0x0F94", "serialNumber": "06B4BE25", "deviceLocator": "Controller1-ChannelA-DIMM0"}]	\N	\N	Acer	Aspire A515-57	D56D8035-0CC3-F04B-B8C2-04585D20B9BF	\N	2026-01-09 06:04:59-03
\.


--
-- Data for Name: config_backups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.config_backups (id, backup_type, data, description, created_at) FROM stdin;
\.


--
-- Data for Name: deleted_devices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deleted_devices (device_id, deleted_at) FROM stdin;
\.


--
-- Data for Name: device_group_memberships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.device_group_memberships (id, device_id, group_id, assigned_by, assigned_at, computer_id) FROM stdin;
\.


--
-- Data for Name: device_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.device_groups (id, organization_id, name, description, color, created_at, updated_at, allowed_networks, allowed_location, allowed_computer_location, dlp_config, blocked_removable_storage, blocked_control_panel, disabled_smartscreen, blocked_cmd_powershell, blocked_registry_editor, allowed_locations) FROM stdin;
\.


--
-- Data for Name: device_locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.device_locations (id, device_id, latitude, longitude, accuracy, provider, address, created_at) FROM stdin;
019f053a-ea47-4587-b8f6-11e8bc11345a	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40789277	-50.09243828	15.00	gps	Av. Dib Jorge, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 14:28:47.293436-03
3159c1d1-dbfb-4b96-acc8-fed3b8e4527d	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40800312	-50.09222690	15.00	gps	R. Francisco Coelho, 745 - Parque Industrial, Penápolis - SP, 16306-536, Brasil, São Paulo, Brasil	2026-03-11 14:33:48.676716-03
4eb35d60-f1f1-4ba4-8a80-704a04062bb3	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40773288	-50.09260882	15.00	gps	Av. Dib Jorge, 611 - Parque Industrial, Penápolis - SP, 16306-500, Brasil, São Paulo, Brasil	2026-03-11 14:36:08.17464-03
161820c4-4bca-48e5-a0e0-3031ed122555	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40775350	-50.09259610	15.00	gps	Av. Dib Jorge, 611 - Parque Industrial, Penápolis - SP, 16306-500, Brasil, São Paulo, Brasil	2026-03-11 14:41:08.578208-03
f6eb1b8f-c38b-47b8-a27d-f842e19dce70	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40800218	-50.09221332	15.00	gps	R. Francisco Coelho, 745 - Parque Industrial, Penápolis - SP, 16306-536, Brasil, São Paulo, Brasil	2026-03-11 14:42:15.960554-03
38c924c4-8faa-4a0d-a2af-e3b1266d7a3b	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40793095	-50.09248565	15.00	gps	Av. Dib Jorge, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 14:47:16.891855-03
600a8a27-9ab4-4b78-ab3b-ed697d36e333	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40826558	-50.09214402	15.00	gps	R. Francisco Coelho, 745 - Parque Industrial, Penápolis - SP, 16306-536, Brasil, São Paulo, Brasil	2026-03-11 14:51:49.268485-03
720daa21-d4e9-49b4-94d0-27a69fc5d77e	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40781853	-50.09256123	15.00	gps	Av. Dib Jorge, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 14:53:52.069808-03
063ce06a-7b9f-4cd8-a42d-8abeebeff2dd	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40782702	-50.09257733	15.00	gps	Av. Dib Jorge, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 14:58:54.118614-03
0dd5c8a6-7628-4a97-bf69-21c93a13de7e	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40808922	-50.09220093	15.00	gps	R. Francisco Coelho, 745 - Parque Industrial, Penápolis - SP, 16306-536, Brasil, São Paulo, Brasil	2026-03-11 15:00:54.258292-03
5f14e49c-8638-468e-ba4e-e55923a95989	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40795513	-50.09236960	15.00	gps	Av. Dib Jorge, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 15:05:56.546192-03
4b149b3f-0bbf-4883-90c9-6658af8caca5	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40798903	-50.09247382	14.72	gps	R. Francisco Coelho, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 16:04:49.573098-03
8ab769e6-a072-41f1-b44f-388f4ef8cef0	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40802753	-50.09242990	15.00	gps	R. Francisco Coelho, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 16:09:49.774258-03
7d540117-48c4-45c4-84db-0b578e989e12	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40784375	-50.09260300	15.00	gps	Av. Dib Jorge, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 16:14:52.809274-03
b5e5fd13-87d2-4164-9a9e-4cb1e9b507c3	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40730270	-50.09239590	43.97	network	R. Francisco Coelho, 100 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 16:16:11.771069-03
9c68647e-8b86-41f6-badf-14e6b32eb71e	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40800060	-50.09231005	15.00	gps	R. Francisco Coelho, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-11 16:16:23.958947-03
7809638f-b687-4b4a-bccc-88dc30dd91b4	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40801520	-50.09225800	27.44	network	R. Francisco Coelho, 745 - Parque Industrial, Penápolis - SP, 16306-536, Brasil, São Paulo, Brasil	2026-03-11 16:21:24.228499-03
0d6c94d1-cfb6-47f8-8656-51eed37a82b2	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40776042	-50.09270088	15.00	gps	Av. Dib Jorge, 611 - Parque Industrial, Penápolis - SP, 16306-500, Brasil, São Paulo, Brasil	2026-03-11 16:24:28.118185-03
ee2b9d2d-d966-42f3-aa2f-cdca534eb064	44755f0f-f91e-4477-af4e-ccbe3f96b9ac	-21.40788007	-50.09251470	15.00	gps	Av. Dib Jorge, 650 - Parque Industrial, Penápolis - SP, 16300-000, Brasil, São Paulo, Brasil	2026-03-12 06:01:52.549379-03
\.


--
-- Data for Name: device_restrictions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.device_restrictions (id, device_id, restrictions, is_global, updated_at) FROM stdin;
\.


--
-- Data for Name: device_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.device_status_history (id, device_id, status_date, status, online_count, last_online_time, created_at, updated_at) FROM stdin;
fd11bba6-d466-4e1e-a744-fbfdbc8c6b24	b074c8e0a876f8cc	2025-10-28	online	1	2025-10-28 07:08:31.43675-03	2025-10-28 07:08:31.43675-03	2025-10-28 07:08:31.43675-03
9f457216-a34f-4357-bcda-35c624efabf4	e875df7bca9807e2	2025-10-29	online	92	2025-10-29 14:53:24.899077-03	2025-10-29 06:11:59.72497-03	2025-10-29 14:53:24.899077-03
cd2e7ddf-04e6-45e1-abf2-6e50a0f12945	e875df7bca9807e2	2025-10-28	online	146	2025-10-28 15:14:27.402441-03	2025-10-28 07:09:33.628949-03	2025-10-28 15:14:27.402441-03
af403fe4-8a2d-4dd9-b786-26c1fb490120	fb74e8e6cf7a1263	2025-10-29	online	67	2025-10-29 14:54:19.356723-03	2025-10-29 07:38:25.327045-03	2025-10-29 14:54:19.356723-03
24257516-1059-4388-b407-075317459020	9683ba8f5197ec9e	2025-12-22	online	77	2025-12-22 16:05:04.399751-03	2025-12-22 07:00:24.337836-03	2025-12-22 16:05:04.399751-03
fe1efa1f-3ec1-47dc-8b9c-23d9a4e2fc08	b142ca5b49b999fe	2025-12-02	online	3	2025-12-02 16:12:48.220249-03	2025-12-02 15:57:33.611461-03	2025-12-02 16:12:48.220249-03
5416e7de-fc4f-4f86-b4e6-7712751193c3	e875df7bca9807e2	2025-10-31	online	131	2025-10-31 17:25:43.225736-03	2025-10-31 06:17:43.773655-03	2025-10-31 17:25:43.225736-03
653b0005-2976-4f94-ace7-fdc7ed393816	fb74e8e6cf7a1263	2025-10-28	online	14	2025-10-28 07:41:43.842942-03	2025-10-28 07:29:36.148888-03	2025-10-28 07:41:43.842942-03
8f9fc2cd-3c24-419d-8bf6-f3b9fc710eb3	d76c64d820c5509b	2025-12-04	online	61	2025-12-04 16:22:44.550666-03	2025-12-04 06:29:47.030335-03	2025-12-04 16:22:44.550666-03
a9bc30b6-8b43-468a-8066-6155e9af1fcb	fb74e8e6cf7a1263	2025-11-14	online	10	2025-11-14 16:15:25.185617-03	2025-11-14 06:24:19.178782-03	2025-11-14 16:15:25.185617-03
9f57da19-155d-4fac-8c50-200da2ef2a3e	fb74e8e6cf7a1263	2025-11-05	online	31	2025-11-05 15:12:17.453019-03	2025-11-05 06:10:47.146487-03	2025-11-05 15:12:17.453019-03
bf36e5b5-d8fe-4c22-a35c-8c042fac8fa3	e875df7bca9807e2	2025-11-01	online	32	2025-11-01 09:51:43.780437-03	2025-11-01 06:01:03.267681-03	2025-11-01 09:51:43.780437-03
4c5aeaa3-a3d5-4907-be4c-94d12ac84fca	fb74e8e6cf7a1263	2025-11-01	online	33	2025-11-01 09:52:08.368547-03	2025-11-01 06:03:24.990113-03	2025-11-01 09:52:08.368547-03
5853610f-ab68-4534-b10c-844ca974f8b3	d76c64d820c5509b	2025-12-03	online	9	2025-12-03 16:07:55.75244-03	2025-12-03 14:57:55.601409-03	2025-12-03 16:07:55.75244-03
58110a3e-caac-4342-925e-82511777787d	fb74e8e6cf7a1263	2025-11-07	online	29	2025-11-07 17:18:22.338255-03	2025-11-07 07:15:38.262734-03	2025-11-07 17:18:22.338255-03
9c7cb6c4-ac55-4731-ae8a-b03b1aab3c90	fb74e8e6cf7a1263	2025-11-08	online	1	2025-11-08 07:06:51.68187-03	2025-11-08 07:06:51.68187-03	2025-11-08 07:06:51.68187-03
918b0aca-fcba-49f8-b5d4-7a765d1fcdb5	9683ba8f5197ec9e	2025-12-23	online	79	2025-12-23 16:15:05.364348-03	2025-12-23 06:12:42.104402-03	2025-12-23 16:15:05.364348-03
ee4ec53a-b2ed-4644-8766-7404b8bc53d2	fa6e1dc009b14808	2025-12-16	online	12	2025-12-16 16:11:46.764081-03	2025-12-16 15:01:47.262157-03	2025-12-16 16:11:46.764081-03
64947b62-0149-46be-b89e-b74a78625b6f	d76c64d820c5509b	2025-12-11	online	69	2025-12-11 16:13:40.382996-03	2025-12-11 06:25:32.525837-03	2025-12-11 16:13:40.382996-03
df22d4d2-d050-4d5a-88f5-846eeeb2908f	e875df7bca9807e2	2025-11-03	online	30	2025-11-03 10:27:00.219071-03	2025-11-03 06:13:45.602904-03	2025-11-03 10:27:00.219071-03
b312ba13-24ea-407c-ad6b-3ce17bbeb3a2	47fa69c563c8813c	2025-12-16	online	34	2025-12-16 11:00:31.218501-03	2025-12-16 08:38:25.052827-03	2025-12-16 11:00:31.218501-03
243a55f4-88c1-4def-88df-f00758ff8ccd	d76c64d820c5509b	2025-12-05	online	36	2025-12-05 16:03:48.711912-03	2025-12-05 06:49:36.991213-03	2025-12-05 16:03:48.711912-03
e65f3958-1110-4b75-a132-f23d46170e12	fb74e8e6cf7a1263	2025-11-12	online	28	2025-11-12 15:13:08.086648-03	2025-11-12 06:05:04.996664-03	2025-11-12 15:13:08.086648-03
e2a62f31-b2cd-48ed-ac1f-b1fbe72f6ac8	fa7a2953dda27a79	2025-12-18	online	7	2025-12-18 06:48:03.380015-03	2025-12-18 06:10:07.709677-03	2025-12-18 06:48:03.380015-03
173d4560-48ba-4212-9fd5-84d310c8a9d2	e875df7bca9807e2	2025-11-27	online	37	2025-11-27 16:56:24.075581-03	2025-11-27 10:18:34.647774-03	2025-11-27 16:56:24.075581-03
e22a0ed8-3515-4824-8b77-1e2a51dd2107	fb74e8e6cf7a1263	2025-11-04	online	44	2025-11-04 15:10:00.01279-03	2025-11-04 06:25:55.727182-03	2025-11-04 15:10:00.01279-03
1df37482-979b-449c-be89-5c59f3c81707	e875df7bca9807e2	2025-11-28	online	43	2025-11-28 15:03:40.897299-03	2025-11-28 05:04:02.854805-03	2025-11-28 15:03:40.897299-03
dbfbde81-2b8d-4924-bc52-57fc09d6df1a	fb74e8e6cf7a1263	2025-11-06	online	26	2025-11-06 15:04:16.553368-03	2025-11-06 06:28:07.654706-03	2025-11-06 15:04:16.553368-03
990a14a3-df61-4bda-a5f7-2ef046f28a4f	d76c64d820c5509b	2025-12-12	online	82	2025-12-12 17:57:12.247191-03	2025-12-12 06:14:42.006449-03	2025-12-12 17:57:12.247191-03
bf597198-705f-4d65-84e9-8169bcccbaf0	fb74e8e6cf7a1263	2025-10-30	online	103	2025-10-30 14:47:02.903348-03	2025-10-30 06:40:44.207013-03	2025-10-30 14:47:02.903348-03
214fffeb-69d0-4823-b6a6-cda02711e23b	fb74e8e6cf7a1263	2025-11-03	online	54	2025-11-03 14:45:46.622546-03	2025-11-03 06:11:33.73197-03	2025-11-03 14:45:46.622546-03
1655429e-c24c-4705-83b3-23a68e021b02	e875df7bca9807e2	2025-10-30	online	57	2025-10-30 15:01:13.670504-03	2025-10-30 06:32:18.326904-03	2025-10-30 15:01:13.670504-03
5eac7bd7-4756-4ead-8d05-894eb586cf7f	fb74e8e6cf7a1263	2025-11-17	online	23	2025-11-17 08:55:03.380487-03	2025-11-17 06:24:41.88834-03	2025-11-17 08:55:03.380487-03
887b428e-226d-40a7-bd07-98dd33ba4016	fb74e8e6cf7a1263	2025-11-10	online	121	2025-11-10 15:06:36.19779-03	2025-11-10 06:59:19.221827-03	2025-11-10 15:06:36.19779-03
102b51f3-4211-4303-b1b0-f0d3f3c3eb07	fb74e8e6cf7a1263	2025-10-31	online	85	2025-10-31 16:23:13.424625-03	2025-10-31 06:21:37.293949-03	2025-10-31 16:23:13.424625-03
646bf46f-663b-473a-85ee-db0a5af2cdb1	d76c64d820c5509b	2025-12-10	online	45	2025-12-10 16:17:20.375806-03	2025-12-10 06:15:34.006296-03	2025-12-10 16:17:20.375806-03
064550d9-4f4b-4102-9a24-037a8839a1ec	9683ba8f5197ec9e	2025-12-29	online	3	2025-12-29 17:06:30.64422-03	2025-12-29 17:02:12.648407-03	2025-12-29 17:06:30.64422-03
ba91bd34-2791-4561-9a00-3107ddf3538d	9683ba8f5197ec9e	2025-12-18	online	30	2025-12-18 13:55:54.57403-03	2025-12-18 06:58:48.763071-03	2025-12-18 13:55:54.57403-03
03794c1e-3d1d-4817-9e7d-71650a1314e8	e875df7bca9807e2	2025-12-02	online	39	2025-12-02 13:37:23.96792-03	2025-12-02 06:22:03.790008-03	2025-12-02 13:37:23.96792-03
96abd86b-0a1d-45eb-ac62-6262de21c947	fb74e8e6cf7a1263	2025-11-11	online	56	2025-11-11 15:05:16.750088-03	2025-11-11 06:05:58.272235-03	2025-11-11 15:05:16.750088-03
ca68f1c8-fb1e-4eb8-9c90-b4c548aa7ec3	e875df7bca9807e2	2025-12-01	online	51	2025-12-01 16:15:48.970237-03	2025-12-01 06:19:36.855753-03	2025-12-01 16:15:48.970237-03
463cb9dc-d059-4f0c-b5bf-c16ba44ee4c3	b142ca5b49b999fe	2025-12-03	online	62	2025-12-03 10:03:07.840706-03	2025-12-03 06:31:08.765115-03	2025-12-03 10:03:07.840706-03
22706f3a-f026-4301-868b-35c22fe96bef	fb74e8e6cf7a1263	2025-11-13	online	70	2025-11-13 15:12:07.733385-03	2025-11-13 06:00:50.853435-03	2025-11-13 15:12:07.733385-03
f4e0b18b-a746-4155-940a-c94d145c03d1	d76c64d820c5509b	2025-12-08	online	71	2025-12-08 16:12:36.590624-03	2025-12-08 06:42:01.991011-03	2025-12-08 16:12:36.590624-03
551332a4-2ba1-4f08-acf8-f95dfbf0488b	0de2642c15b8af77	2025-12-03	online	36	2025-12-03 14:21:35.801624-03	2025-12-03 10:12:03.810742-03	2025-12-03 14:21:35.801624-03
983a3520-48b5-4c56-863b-00457e63a0fd	b6ac110702ee4e03	2025-12-03	online	3	2025-12-03 14:43:48.103335-03	2025-12-03 14:32:09.041924-03	2025-12-03 14:43:48.103335-03
485581d3-4a0e-4ff3-be4a-010f21a49a45	d447955e6dc07070	2025-12-02	online	9	2025-12-02 15:28:42.461948-03	2025-12-02 14:08:32.073521-03	2025-12-02 15:28:42.461948-03
bfe95512-93ec-4f00-8e36-c4688d876385	971c21a736c31588	2025-12-02	online	1	2025-12-02 15:37:05.260133-03	2025-12-02 15:37:05.260133-03	2025-12-02 15:37:05.260133-03
1364d569-495b-401c-9d32-19eb9c98770c	ba92d0eacb5df9b1	2025-12-16	online	9	2025-12-16 11:51:29.787176-03	2025-12-16 11:26:09.298078-03	2025-12-16 11:51:29.787176-03
84151a25-9e2f-41c0-bec4-4a8b29f4bc95	d76c64d820c5509b	2025-12-16	online	19	2025-12-16 08:28:23.656695-03	2025-12-16 06:15:11.542164-03	2025-12-16 08:28:23.656695-03
c3b6b680-61b4-4432-8acd-7d47d1d3a2d9	9683ba8f5197ec9e	2025-12-24	online	31	2025-12-24 11:01:21.349772-03	2025-12-24 06:14:04.533019-03	2025-12-24 11:01:21.349772-03
0baef492-2c6a-4c51-bfdf-4eccaeeba761	d76c64d820c5509b	2025-12-09	online	62	2025-12-09 15:27:31.346148-03	2025-12-09 06:46:15.791265-03	2025-12-09 15:27:31.346148-03
0c918dfc-4b5f-4bbf-bb32-caa684ab3c07	fa6e1dc009b14808	2025-12-17	online	9	2025-12-17 07:27:48.860257-03	2025-12-17 06:08:56.126784-03	2025-12-17 07:27:48.860257-03
3497524f-820b-4968-9c18-bab0fbf8fe33	d76c64d820c5509b	2025-12-15	online	59	2025-12-15 16:18:06.016855-03	2025-12-15 06:12:00.146243-03	2025-12-15 16:18:06.016855-03
2b629da4-3097-464b-a117-205359cb7318	16cb9c484de07dfb	2025-12-17	online	30	2025-12-17 13:48:34.96735-03	2025-12-17 08:15:35.231898-03	2025-12-17 13:48:34.96735-03
a1ad5126-aabb-411d-ab6e-6927014e4b54	9683ba8f5197ec9e	2025-12-19	online	42	2025-12-19 15:56:12.371867-03	2025-12-19 06:26:28.561539-03	2025-12-19 15:56:12.371867-03
2885feb2-21f1-4a34-a851-b2fdd0f8148a	7481835c934f771a	2025-12-17	online	5	2025-12-17 08:05:41.933593-03	2025-12-17 07:53:51.205983-03	2025-12-17 08:05:41.933593-03
5a157f7f-0169-4f19-bf7e-82349f993435	fa7a2953dda27a79	2025-12-17	online	20	2025-12-17 16:21:35.153307-03	2025-12-17 13:56:37.162959-03	2025-12-17 16:21:35.153307-03
bbf18195-ec97-43be-85fb-9ca38185692b	5c334c4c786aadab	2026-03-10	online	105	2026-03-10 16:53:48.212337-03	2026-03-10 08:02:09.056732-03	2026-03-10 16:53:48.212337-03
f1ec7c30-c79e-4c2b-8cdb-9478021abf4c	9683ba8f5197ec9e	2025-12-30	online	14	2025-12-30 15:54:37.601722-03	2025-12-30 06:23:36.978546-03	2025-12-30 15:54:37.601722-03
6761082a-0570-4a3f-9a65-454438e83cfe	9683ba8f5197ec9e	2025-12-26	online	54	2025-12-26 15:37:51.021364-03	2025-12-26 06:22:58.09464-03	2025-12-26 15:37:51.021364-03
6ec3f33e-00c0-4082-ac59-e6ee1e34f49b	5c334c4c786aadab	2026-03-11	online	3282	2026-03-11 16:27:58.47087-03	2026-03-11 10:10:32.687393-03	2026-03-11 16:27:58.47087-03
\.


--
-- Data for Name: device_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.device_users (id, organization_id, user_id, name, cpf, email, phone, department, "position", notes, is_active, created_at, updated_at, birth_year, device_model, device_serial_number, birth_date) FROM stdin;
de7a5026-ac96-4147-bbe9-7a177030345d	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	test_direct	Teste Direto	99988877766	\N	\N	\N	\N	\N	t	2026-03-11 10:14:20.502101-03	2026-03-11 10:14:20.502101-03	\N	\N	\N	2003-10-11
\.


--
-- Data for Name: devices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.devices (id, organization_id, device_id, name, model, manufacturer, android_version, api_level, serial_number, imei, mac_address, ip_address, battery_level, battery_status, is_charging, storage_total, storage_used, memory_total, memory_used, cpu_architecture, screen_resolution, screen_density, network_type, wifi_ssid, is_wifi_enabled, is_bluetooth_enabled, is_location_enabled, is_developer_options_enabled, is_adb_enabled, is_unknown_sources_enabled, is_device_owner, is_profile_owner, is_kiosk_mode, app_version, timezone, language, country, status, last_seen, created_at, updated_at, assigned_device_user_id, deleted_at, os_type, meid, compliance_status, sim_number, phone_number, is_rooted, lost_mode, lost_mode_message, data_usage_bytes) FROM stdin;
44755f0f-f91e-4477-af4e-ccbe3f96b9ac	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	5c334c4c786aadab	realme RMX3834	RMX3834	realme	13	33	5c334c4c786aadab	\N	02:00:00:00:00:00	177.129.252.207	0	not_charging	f	0	0	2900365312	1792712704	arm64-v8a	720x1440	320	wifi	CenterSport	t	f	t	t	f	t	t	f	\N	1.1	America/Sao_Paulo	pt	BR	offline	2026-03-12 06:01:51.536-03	2026-03-11 14:28:47.199529-03	2026-03-12 06:01:52.528459-03	de7a5026-ac96-4147-bbe9-7a177030345d	\N	Android	\N	non_compliant	\N	\N	f	f	\N	0
\.


--
-- Data for Name: group_alert_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.group_alert_history (id, group_id, organization_id, device_id, device_name, alert_type, alert_title, alert_message, alert_data, created_at) FROM stdin;
\.


--
-- Data for Name: group_available_apps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.group_available_apps (id, group_id, package_name, app_name, icon_base64, first_seen_at, last_seen_at, seen_in_devices, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: installed_apps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.installed_apps (id, device_id, package_name, app_name, icon_base64, is_system_app, is_enabled, version_name, version_code, install_time, update_time, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organizations (id, name, slug, description, settings, created_at, updated_at) FROM stdin;
4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	Organização Padrão	default	Organização padrão do sistema MDM	{}	2025-10-03 15:46:45.699444-03	2025-10-03 15:46:45.699444-03
\.


--
-- Data for Name: scheduled_commands; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.scheduled_commands (id, command_type, target_type, target_id, target_name, parameters, schedule_type, scheduled_time, scheduled_date, day_of_week, is_active, last_executed_at, next_execution_at, created_at) FROM stdin;
\.


--
-- Data for Name: support_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.support_messages (id, organization_id, device_id, device_name, message, android_version, model, status, received_at, resolved_at, resolved_by) FROM stdin;
\.


--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_config (id, config_key, config_value, description, created_at, updated_at) FROM stdin;
077ecbde-1a59-4e18-ae84-46891c2b69b0	max_pings_per_minute	60	Máximo de pings por minuto	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
84ca81d2-3f45-4d4e-b847-77bf051de3cc	base_inactivity_timeout	30000	Timeout base de inatividade em ms	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
b00462da-6c86-4f30-80f1-e099bce880a0	max_inactivity_timeout	120000	Timeout máximo de inatividade em ms	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
a16ad504-d673-4939-b89c-ae0bcbb523a8	min_inactivity_timeout	15000	Timeout mínimo de inatividade em ms	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
b1c691bd-4d03-4433-9d76-ff45fbd9f80d	health_score_threshold	0.5	Limiar de score de saúde	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
1dd5c9c8-346d-4d33-bfdb-2961c28fcef6	heartbeat_interval	10000	Intervalo de heartbeat em ms	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
3d0dae9f-0f01-4a3f-9b3a-a583351bb9f6	ping_probability	0.3	Probabilidade de ping	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
bca3118e-09e9-449d-900e-735150f187de	max_reconnect_attempts	20	Máximo de tentativas de reconexão	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
78f53530-06a1-45af-81ce-071600316bbc	initial_reconnect_delay	1000	Delay inicial de reconexão em ms	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
d3a95956-2e56-41bc-92f7-e098567b230e	max_reconnect_delay	30000	Delay máximo de reconexão em ms	2025-10-02 13:38:01.031206-03	2025-10-02 13:38:01.031206-03
\.


--
-- Data for Name: system_configs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_configs (id, organization_id, config_key, config_value, description, created_at, updated_at) FROM stdin;
03842c39-b4c6-4675-aef2-2668cda4c121	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	websocket_port	{"port": 3002}	Porta do servidor WebSocket	2025-10-03 15:46:45.826686-03	2025-10-03 15:46:45.826686-03
05c5e4fb-b5df-433a-ad74-d7bde38dfea8	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	heartbeat_interval	{"interval": 10000}	Intervalo do heartbeat em ms	2025-10-03 15:46:45.831682-03	2025-10-03 15:46:45.831682-03
4be80aca-d523-44b2-801a-bb9a0642ca12	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	max_pings_per_minute	{"max": 60}	Máximo de pings por minuto por dispositivo	2025-10-03 15:46:45.833261-03	2025-10-03 15:46:45.833261-03
83d93a51-64a1-40f5-8c91-e0141fab57a2	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	log_level	{"level": "info"}	Nível de log do sistema	2025-10-03 15:46:45.834482-03	2025-10-03 15:46:45.834482-03
\.


--
-- Data for Name: uem_computer_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.uem_computer_status_history (id, computer_id, status, memory_used, storage_used, cpu_usage_percent, created_at) FROM stdin;
\.


--
-- Data for Name: uem_computers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.uem_computers (id, organization_id, computer_id, name, hostname, domain, os_type, os_version, os_build, cpu_model, cpu_cores, cpu_threads, cpu_architecture, memory_total, memory_used, storage_total, storage_used, ip_address, mac_address, network_type, wifi_ssid, is_wifi_enabled, is_bluetooth_enabled, agent_version, agent_installed_at, last_heartbeat, logged_in_user, assigned_device_user_id, antivirus_installed, antivirus_enabled, antivirus_name, firewall_enabled, encryption_enabled, status, compliance_status, last_seen, created_at, updated_at) FROM stdin;
9ac17675-b62b-44ae-b470-01cf73ab87e4	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	c4843cb0-3ae0-4244-ac94-8dcd9b4dd9ba	CSSPNOT0038	CSSPNOT0038	\N	Windows	\N	\N	\N	\N	\N	x64	16869548032	10255908864	511210156032	328240721920	0.0.0.0	26:B2:B9:0D:84:BD	\N	\N	f	f	1.0.0	\N	2025-11-04 12:00:15.593-03	\N	\N	f	f	\N	f	f	offline	unknown	2025-11-04 12:00:15.589-03	2025-11-04 11:49:28.353989-03	2025-11-04 12:00:15.594075-03
\.


--
-- Data for Name: uem_installed_programs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.uem_installed_programs (id, computer_id, program_name, publisher, version, install_date, install_location, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: uem_remote_actions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.uem_remote_actions (id, computer_id, action_type, action_status, requested_by, executed_at, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, organization_id, email, password_hash, first_name, last_name, role, is_active, last_login, created_at, updated_at) FROM stdin;
e4ded1dc-7656-4aa5-9fa3-736313ae9559	4ba1c48b-dbfc-4cd8-8858-8a5ded1f833f	admin@mdm.local	$2b$10$JrswlUgVgAhLjabQa4YjTeH3BZlJGNqVFRnFULuxycCXusmO9s0wy	Admin	Sistema	admin	t	\N	2025-10-03 15:46:45.822207-03	2025-10-03 15:46:45.822207-03
\.


--
-- Data for Name: web_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.web_users (id, username, password_hash, role, created_by, created_at) FROM stdin;
f9d388a8-a84d-4cda-85fb-c18bdc440f83	admin	$2b$10$ZjA3BHJvv87xrj909V9So.Q2/j1USL8eRk2KTbmiEiP8RGKRKc/ti	admin	system	2025-12-15 11:26:22.897469-03
429e4d81-eed7-43a7-89f9-da2bce7f6b14	teste	$2b$10$oZYHP9KHrifkSCRobHEmRO16gYzyg871b.nq3e/IRzyaY/mEpNUF.	user	admin	2025-12-15 13:31:31.821872-03
\.


--
-- Name: admin_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.admin_users_id_seq', 1, true);


--
-- Name: alerts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.alerts_id_seq', 1, false);


--
-- Name: computer_status_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.computer_status_history_id_seq', 20289, true);


--
-- Name: config_backups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.config_backups_id_seq', 1, false);


--
-- Name: device_restrictions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.device_restrictions_id_seq', 1, false);


--
-- Name: scheduled_commands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.scheduled_commands_id_seq', 1, false);


--
-- Name: admin_passwords admin_passwords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_passwords
    ADD CONSTRAINT admin_passwords_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_key UNIQUE (username);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: app_access_history app_access_history_device_id_package_name_access_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_access_history
    ADD CONSTRAINT app_access_history_device_id_package_name_access_date_key UNIQUE (device_id, package_name, access_date);


--
-- Name: app_access_history app_access_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_access_history
    ADD CONSTRAINT app_access_history_pkey PRIMARY KEY (id);


--
-- Name: app_policies app_policies_group_id_package_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_policies
    ADD CONSTRAINT app_policies_group_id_package_name_key UNIQUE (group_id, package_name);


--
-- Name: app_policies app_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_policies
    ADD CONSTRAINT app_policies_pkey PRIMARY KEY (id);


--
-- Name: applocker_allowed_programs applocker_allowed_programs_computer_id_name_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applocker_allowed_programs
    ADD CONSTRAINT applocker_allowed_programs_computer_id_name_path_key UNIQUE (computer_id, name, path);


--
-- Name: applocker_allowed_programs applocker_allowed_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applocker_allowed_programs
    ADD CONSTRAINT applocker_allowed_programs_pkey PRIMARY KEY (id);


--
-- Name: applocker_config applocker_config_computer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applocker_config
    ADD CONSTRAINT applocker_config_computer_id_key UNIQUE (computer_id);


--
-- Name: applocker_config applocker_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applocker_config
    ADD CONSTRAINT applocker_config_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: computer_group_memberships computer_group_memberships_computer_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_group_memberships
    ADD CONSTRAINT computer_group_memberships_computer_id_group_id_key UNIQUE (computer_id, group_id);


--
-- Name: computer_group_memberships computer_group_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_group_memberships
    ADD CONSTRAINT computer_group_memberships_pkey PRIMARY KEY (id);


--
-- Name: computer_installed_programs computer_installed_programs_computer_id_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_installed_programs
    ADD CONSTRAINT computer_installed_programs_computer_id_name_version_key UNIQUE (computer_id, name, version);


--
-- Name: computer_installed_programs computer_installed_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_installed_programs
    ADD CONSTRAINT computer_installed_programs_pkey PRIMARY KEY (id);


--
-- Name: computer_locations computer_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_locations
    ADD CONSTRAINT computer_locations_pkey PRIMARY KEY (id);


--
-- Name: computer_monitors computer_monitors_computer_id_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_monitors
    ADD CONSTRAINT computer_monitors_computer_id_serial_number_key UNIQUE (computer_id, serial_number);


--
-- Name: computer_monitors computer_monitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_monitors
    ADD CONSTRAINT computer_monitors_pkey PRIMARY KEY (id);


--
-- Name: computer_policies computer_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_policies
    ADD CONSTRAINT computer_policies_pkey PRIMARY KEY (id);


--
-- Name: computer_printers computer_printers_computer_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_printers
    ADD CONSTRAINT computer_printers_computer_id_name_key UNIQUE (computer_id, name);


--
-- Name: computer_printers computer_printers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_printers
    ADD CONSTRAINT computer_printers_pkey PRIMARY KEY (id);


--
-- Name: computer_restrictions computer_restrictions_computer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_restrictions
    ADD CONSTRAINT computer_restrictions_computer_id_key UNIQUE (computer_id);


--
-- Name: computer_restrictions computer_restrictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_restrictions
    ADD CONSTRAINT computer_restrictions_pkey PRIMARY KEY (id);


--
-- Name: computer_status_history computer_status_history_computer_id_status_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_status_history
    ADD CONSTRAINT computer_status_history_computer_id_status_date_key UNIQUE (computer_id, status_date);


--
-- Name: computer_status_history computer_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_status_history
    ADD CONSTRAINT computer_status_history_pkey PRIMARY KEY (id);


--
-- Name: computer_storage_drives computer_storage_drives_computer_id_drive_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_storage_drives
    ADD CONSTRAINT computer_storage_drives_computer_id_drive_key UNIQUE (computer_id, drive);


--
-- Name: computer_storage_drives computer_storage_drives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_storage_drives
    ADD CONSTRAINT computer_storage_drives_pkey PRIMARY KEY (id);


--
-- Name: computers computers_organization_id_computer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computers
    ADD CONSTRAINT computers_organization_id_computer_id_key UNIQUE (organization_id, computer_id);


--
-- Name: computers computers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computers
    ADD CONSTRAINT computers_pkey PRIMARY KEY (id);


--
-- Name: config_backups config_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_backups
    ADD CONSTRAINT config_backups_pkey PRIMARY KEY (id);


--
-- Name: deleted_devices deleted_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_devices
    ADD CONSTRAINT deleted_devices_pkey PRIMARY KEY (device_id);


--
-- Name: device_group_memberships device_group_memberships_device_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_group_memberships
    ADD CONSTRAINT device_group_memberships_device_id_group_id_key UNIQUE (device_id, group_id);


--
-- Name: device_group_memberships device_group_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_group_memberships
    ADD CONSTRAINT device_group_memberships_pkey PRIMARY KEY (id);


--
-- Name: device_groups device_groups_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_groups
    ADD CONSTRAINT device_groups_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: device_groups device_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_groups
    ADD CONSTRAINT device_groups_pkey PRIMARY KEY (id);


--
-- Name: device_locations device_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_locations
    ADD CONSTRAINT device_locations_pkey PRIMARY KEY (id);


--
-- Name: device_restrictions device_restrictions_device_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_restrictions
    ADD CONSTRAINT device_restrictions_device_id_key UNIQUE (device_id);


--
-- Name: device_restrictions device_restrictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_restrictions
    ADD CONSTRAINT device_restrictions_pkey PRIMARY KEY (id);


--
-- Name: device_status_history device_status_history_device_id_status_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_status_history
    ADD CONSTRAINT device_status_history_device_id_status_date_key UNIQUE (device_id, status_date);


--
-- Name: device_status_history device_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_status_history
    ADD CONSTRAINT device_status_history_pkey PRIMARY KEY (id);


--
-- Name: device_users device_users_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_users
    ADD CONSTRAINT device_users_cpf_key UNIQUE (cpf);


--
-- Name: device_users device_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_users
    ADD CONSTRAINT device_users_pkey PRIMARY KEY (id);


--
-- Name: device_users device_users_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_users
    ADD CONSTRAINT device_users_user_id_key UNIQUE (user_id);


--
-- Name: devices devices_organization_id_device_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_organization_id_device_id_key UNIQUE (organization_id, device_id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--
-- Name: group_alert_history group_alert_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_alert_history
    ADD CONSTRAINT group_alert_history_pkey PRIMARY KEY (id);


--
-- Name: group_available_apps group_available_apps_group_id_package_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_available_apps
    ADD CONSTRAINT group_available_apps_group_id_package_name_key UNIQUE (group_id, package_name);


--
-- Name: group_available_apps group_available_apps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_available_apps
    ADD CONSTRAINT group_available_apps_pkey PRIMARY KEY (id);


--
-- Name: installed_apps installed_apps_device_id_package_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_apps
    ADD CONSTRAINT installed_apps_device_id_package_name_key UNIQUE (device_id, package_name);


--
-- Name: installed_apps installed_apps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_apps
    ADD CONSTRAINT installed_apps_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: scheduled_commands scheduled_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_commands
    ADD CONSTRAINT scheduled_commands_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_config_key_key UNIQUE (config_key);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);


--
-- Name: system_configs system_configs_organization_id_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_configs
    ADD CONSTRAINT system_configs_organization_id_config_key_key UNIQUE (organization_id, config_key);


--
-- Name: system_configs system_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_configs
    ADD CONSTRAINT system_configs_pkey PRIMARY KEY (id);


--
-- Name: uem_computer_status_history uem_computer_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_computer_status_history
    ADD CONSTRAINT uem_computer_status_history_pkey PRIMARY KEY (id);


--
-- Name: uem_computers uem_computers_organization_id_computer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_computers
    ADD CONSTRAINT uem_computers_organization_id_computer_id_key UNIQUE (organization_id, computer_id);


--
-- Name: uem_computers uem_computers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_computers
    ADD CONSTRAINT uem_computers_pkey PRIMARY KEY (id);


--
-- Name: uem_installed_programs uem_installed_programs_computer_id_program_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_installed_programs
    ADD CONSTRAINT uem_installed_programs_computer_id_program_name_version_key UNIQUE (computer_id, program_name, version);


--
-- Name: uem_installed_programs uem_installed_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_installed_programs
    ADD CONSTRAINT uem_installed_programs_pkey PRIMARY KEY (id);


--
-- Name: uem_remote_actions uem_remote_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_remote_actions
    ADD CONSTRAINT uem_remote_actions_pkey PRIMARY KEY (id);


--
-- Name: device_group_memberships unique_computer_group_membership; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_group_memberships
    ADD CONSTRAINT unique_computer_group_membership UNIQUE (computer_id, group_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: web_users web_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_users
    ADD CONSTRAINT web_users_pkey PRIMARY KEY (id);


--
-- Name: web_users web_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_users
    ADD CONSTRAINT web_users_username_key UNIQUE (username);


--
-- Name: device_group_memberships_computer_id_group_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX device_group_memberships_computer_id_group_id_unique ON public.device_group_memberships USING btree (computer_id, group_id) WHERE (computer_id IS NOT NULL);


--
-- Name: idx_alerts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_created_at ON public.alerts USING btree (created_at DESC);


--
-- Name: idx_alerts_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_device_id ON public.alerts USING btree (device_id);


--
-- Name: idx_alerts_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_is_read ON public.alerts USING btree (is_read);


--
-- Name: idx_alerts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_type ON public.alerts USING btree (type);


--
-- Name: idx_app_access_history_access_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_access_history_access_date ON public.app_access_history USING btree (access_date);


--
-- Name: idx_app_access_history_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_access_history_device_id ON public.app_access_history USING btree (device_id);


--
-- Name: idx_app_access_history_last_access_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_access_history_last_access_time ON public.app_access_history USING btree (last_access_time);


--
-- Name: idx_app_access_history_package_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_access_history_package_name ON public.app_access_history USING btree (package_name);


--
-- Name: idx_app_policies_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_policies_group_id ON public.app_policies USING btree (group_id);


--
-- Name: idx_app_policies_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_policies_organization_id ON public.app_policies USING btree (organization_id);


--
-- Name: idx_applocker_config_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applocker_config_computer_id ON public.applocker_config USING btree (computer_id);


--
-- Name: idx_applocker_programs_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applocker_programs_computer_id ON public.applocker_allowed_programs USING btree (computer_id);


--
-- Name: idx_applocker_programs_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applocker_programs_name ON public.applocker_allowed_programs USING btree (name);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_admin ON public.audit_logs USING btree (admin_username);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_computer_group_memberships_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_group_memberships_computer_id ON public.computer_group_memberships USING btree (computer_id);


--
-- Name: idx_computer_group_memberships_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_group_memberships_group_id ON public.computer_group_memberships USING btree (group_id);


--
-- Name: idx_computer_installed_programs_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_installed_programs_computer_id ON public.computer_installed_programs USING btree (computer_id);


--
-- Name: idx_computer_locations_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_locations_computer_id ON public.computer_locations USING btree (computer_id);


--
-- Name: idx_computer_locations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_locations_created_at ON public.computer_locations USING btree (created_at);


--
-- Name: idx_computer_monitors_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_monitors_computer_id ON public.computer_monitors USING btree (computer_id);


--
-- Name: idx_computer_policies_group_only; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_computer_policies_group_only ON public.computer_policies USING btree (group_id) WHERE (user_id IS NULL);


--
-- Name: idx_computer_policies_group_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_computer_policies_group_user ON public.computer_policies USING btree (group_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_computer_policies_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_policies_organization_id ON public.computer_policies USING btree (organization_id);


--
-- Name: idx_computer_policies_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_policies_user_id ON public.computer_policies USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_computer_printers_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_printers_computer_id ON public.computer_printers USING btree (computer_id);


--
-- Name: idx_computer_restrictions_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_restrictions_computer_id ON public.computer_restrictions USING btree (computer_id);


--
-- Name: idx_computer_status_history_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_status_history_date ON public.computer_status_history USING btree (status_date);


--
-- Name: idx_computer_status_history_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_status_history_status_date ON public.computer_status_history USING btree (status, status_date);


--
-- Name: idx_computer_storage_drives_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computer_storage_drives_computer_id ON public.computer_storage_drives USING btree (computer_id);


--
-- Name: idx_computers_assigned_device_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computers_assigned_device_user_id ON public.computers USING btree (assigned_device_user_id);


--
-- Name: idx_computers_compliance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computers_compliance_status ON public.computers USING btree (compliance_status);


--
-- Name: idx_computers_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computers_computer_id ON public.computers USING btree (computer_id);


--
-- Name: idx_computers_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computers_last_seen ON public.computers USING btree (last_seen);


--
-- Name: idx_computers_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computers_organization_id ON public.computers USING btree (organization_id);


--
-- Name: idx_computers_os_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computers_os_type ON public.computers USING btree (os_type);


--
-- Name: idx_computers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_computers_status ON public.computers USING btree (status);


--
-- Name: idx_device_group_memberships_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_group_memberships_computer_id ON public.device_group_memberships USING btree (computer_id);


--
-- Name: idx_device_group_memberships_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_group_memberships_device_id ON public.device_group_memberships USING btree (device_id);


--
-- Name: idx_device_group_memberships_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_group_memberships_group_id ON public.device_group_memberships USING btree (group_id);


--
-- Name: idx_device_groups_allowed_networks; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_groups_allowed_networks ON public.device_groups USING gin (allowed_networks);


--
-- Name: idx_device_groups_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_groups_organization_id ON public.device_groups USING btree (organization_id);


--
-- Name: idx_device_locations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_locations_created_at ON public.device_locations USING btree (created_at);


--
-- Name: idx_device_locations_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_locations_device_id ON public.device_locations USING btree (device_id);


--
-- Name: idx_device_status_history_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_status_history_device_id ON public.device_status_history USING btree (device_id);


--
-- Name: idx_device_status_history_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_status_history_status ON public.device_status_history USING btree (status);


--
-- Name: idx_device_status_history_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_status_history_status_date ON public.device_status_history USING btree (status_date);


--
-- Name: idx_device_users_cpf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_users_cpf ON public.device_users USING btree (cpf);


--
-- Name: idx_device_users_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_users_is_active ON public.device_users USING btree (is_active);


--
-- Name: idx_device_users_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_users_organization_id ON public.device_users USING btree (organization_id);


--
-- Name: idx_device_users_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_users_user_id ON public.device_users USING btree (user_id);


--
-- Name: idx_devices_assigned_device_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_assigned_device_user_id ON public.devices USING btree (assigned_device_user_id);


--
-- Name: idx_devices_compliance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_compliance_status ON public.devices USING btree (compliance_status);


--
-- Name: idx_devices_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_device_id ON public.devices USING btree (device_id);


--
-- Name: idx_devices_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_last_seen ON public.devices USING btree (last_seen);


--
-- Name: idx_devices_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_organization_id ON public.devices USING btree (organization_id);


--
-- Name: idx_devices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_status ON public.devices USING btree (status);


--
-- Name: idx_group_alert_history_alert_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_alert_history_alert_type ON public.group_alert_history USING btree (alert_type);


--
-- Name: idx_group_alert_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_alert_history_created_at ON public.group_alert_history USING btree (created_at);


--
-- Name: idx_group_alert_history_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_alert_history_device_id ON public.group_alert_history USING btree (device_id);


--
-- Name: idx_group_alert_history_group_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_alert_history_group_date ON public.group_alert_history USING btree (group_id, created_at DESC);


--
-- Name: idx_group_alert_history_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_alert_history_group_id ON public.group_alert_history USING btree (group_id);


--
-- Name: idx_group_alert_history_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_alert_history_organization_id ON public.group_alert_history USING btree (organization_id);


--
-- Name: idx_group_available_apps_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_available_apps_group_id ON public.group_available_apps USING btree (group_id);


--
-- Name: idx_group_available_apps_package_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_available_apps_package_name ON public.group_available_apps USING btree (package_name);


--
-- Name: idx_installed_apps_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installed_apps_device_id ON public.installed_apps USING btree (device_id);


--
-- Name: idx_installed_apps_package_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installed_apps_package_name ON public.installed_apps USING btree (package_name);


--
-- Name: idx_scheduled_commands_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_commands_active ON public.scheduled_commands USING btree (is_active);


--
-- Name: idx_scheduled_commands_next; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_commands_next ON public.scheduled_commands USING btree (next_execution_at);


--
-- Name: idx_support_messages_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_device_id ON public.support_messages USING btree (device_id);


--
-- Name: idx_support_messages_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_organization_id ON public.support_messages USING btree (organization_id);


--
-- Name: idx_support_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_status ON public.support_messages USING btree (status);


--
-- Name: idx_uem_actions_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_actions_computer_id ON public.uem_remote_actions USING btree (computer_id);


--
-- Name: idx_uem_actions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_actions_status ON public.uem_remote_actions USING btree (action_status);


--
-- Name: idx_uem_computers_assigned_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_computers_assigned_user ON public.uem_computers USING btree (assigned_device_user_id);


--
-- Name: idx_uem_computers_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_computers_computer_id ON public.uem_computers USING btree (computer_id);


--
-- Name: idx_uem_computers_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_computers_organization_id ON public.uem_computers USING btree (organization_id);


--
-- Name: idx_uem_computers_os_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_computers_os_type ON public.uem_computers USING btree (os_type);


--
-- Name: idx_uem_computers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_computers_status ON public.uem_computers USING btree (status);


--
-- Name: idx_uem_programs_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_programs_computer_id ON public.uem_installed_programs USING btree (computer_id);


--
-- Name: idx_uem_status_history_computer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_status_history_computer_id ON public.uem_computer_status_history USING btree (computer_id);


--
-- Name: idx_uem_status_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uem_status_history_created_at ON public.uem_computer_status_history USING btree (created_at DESC);


--
-- Name: idx_web_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_users_username ON public.web_users USING btree (username);


--
-- Name: app_access_history update_app_access_history_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_app_access_history_updated_at BEFORE UPDATE ON public.app_access_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: app_policies update_app_policies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_app_policies_updated_at BEFORE UPDATE ON public.app_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: applocker_allowed_programs update_applocker_allowed_programs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_applocker_allowed_programs_updated_at BEFORE UPDATE ON public.applocker_allowed_programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: applocker_config update_applocker_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_applocker_config_updated_at BEFORE UPDATE ON public.applocker_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: computer_installed_programs update_computer_installed_programs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_computer_installed_programs_updated_at BEFORE UPDATE ON public.computer_installed_programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: computer_monitors update_computer_monitors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_computer_monitors_updated_at BEFORE UPDATE ON public.computer_monitors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: computer_policies update_computer_policies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_computer_policies_updated_at BEFORE UPDATE ON public.computer_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: computer_printers update_computer_printers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_computer_printers_updated_at BEFORE UPDATE ON public.computer_printers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: computer_restrictions update_computer_restrictions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_computer_restrictions_updated_at BEFORE UPDATE ON public.computer_restrictions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: computer_storage_drives update_computer_storage_drives_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_computer_storage_drives_updated_at BEFORE UPDATE ON public.computer_storage_drives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: computers update_computers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_computers_updated_at BEFORE UPDATE ON public.computers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: device_groups update_device_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_device_groups_updated_at BEFORE UPDATE ON public.device_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: device_users update_device_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_device_users_updated_at BEFORE UPDATE ON public.device_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: devices update_devices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: group_available_apps update_group_available_apps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_group_available_apps_updated_at BEFORE UPDATE ON public.group_available_apps FOR EACH ROW EXECUTE FUNCTION public.update_group_available_apps_updated_at();


--
-- Name: installed_apps update_installed_apps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_installed_apps_updated_at BEFORE UPDATE ON public.installed_apps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: system_config update_system_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: system_configs update_system_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_system_configs_updated_at BEFORE UPDATE ON public.system_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: uem_computers update_uem_computers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_uem_computers_updated_at BEFORE UPDATE ON public.uem_computers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: uem_installed_programs update_uem_programs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_uem_programs_updated_at BEFORE UPDATE ON public.uem_installed_programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: app_policies app_policies_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_policies
    ADD CONSTRAINT app_policies_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.device_groups(id) ON DELETE CASCADE;


--
-- Name: app_policies app_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_policies
    ADD CONSTRAINT app_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: applocker_allowed_programs applocker_allowed_programs_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applocker_allowed_programs
    ADD CONSTRAINT applocker_allowed_programs_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: applocker_config applocker_config_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applocker_config
    ADD CONSTRAINT applocker_config_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: computer_group_memberships computer_group_memberships_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_group_memberships
    ADD CONSTRAINT computer_group_memberships_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: computer_group_memberships computer_group_memberships_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_group_memberships
    ADD CONSTRAINT computer_group_memberships_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: computer_group_memberships computer_group_memberships_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_group_memberships
    ADD CONSTRAINT computer_group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.device_groups(id) ON DELETE CASCADE;


--
-- Name: computer_installed_programs computer_installed_programs_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_installed_programs
    ADD CONSTRAINT computer_installed_programs_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: computer_locations computer_locations_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_locations
    ADD CONSTRAINT computer_locations_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: computer_monitors computer_monitors_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_monitors
    ADD CONSTRAINT computer_monitors_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: computer_policies computer_policies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_policies
    ADD CONSTRAINT computer_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: computer_policies computer_policies_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_policies
    ADD CONSTRAINT computer_policies_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.device_groups(id) ON DELETE CASCADE;


--
-- Name: computer_policies computer_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_policies
    ADD CONSTRAINT computer_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: computer_policies computer_policies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_policies
    ADD CONSTRAINT computer_policies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.device_users(id) ON DELETE CASCADE;


--
-- Name: computer_printers computer_printers_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_printers
    ADD CONSTRAINT computer_printers_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: computer_restrictions computer_restrictions_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_restrictions
    ADD CONSTRAINT computer_restrictions_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: computer_storage_drives computer_storage_drives_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_storage_drives
    ADD CONSTRAINT computer_storage_drives_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: computers computers_assigned_device_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computers
    ADD CONSTRAINT computers_assigned_device_user_id_fkey FOREIGN KEY (assigned_device_user_id) REFERENCES public.device_users(id) ON DELETE SET NULL;


--
-- Name: computers computers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computers
    ADD CONSTRAINT computers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: device_group_memberships device_group_memberships_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_group_memberships
    ADD CONSTRAINT device_group_memberships_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: device_group_memberships device_group_memberships_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_group_memberships
    ADD CONSTRAINT device_group_memberships_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.computers(id) ON DELETE CASCADE;


--
-- Name: device_group_memberships device_group_memberships_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_group_memberships
    ADD CONSTRAINT device_group_memberships_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: device_group_memberships device_group_memberships_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_group_memberships
    ADD CONSTRAINT device_group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.device_groups(id) ON DELETE CASCADE;


--
-- Name: device_groups device_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_groups
    ADD CONSTRAINT device_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: device_locations device_locations_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_locations
    ADD CONSTRAINT device_locations_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: device_users device_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_users
    ADD CONSTRAINT device_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: devices devices_assigned_device_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_assigned_device_user_id_fkey FOREIGN KEY (assigned_device_user_id) REFERENCES public.device_users(id) ON DELETE SET NULL;


--
-- Name: devices devices_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: group_alert_history group_alert_history_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_alert_history
    ADD CONSTRAINT group_alert_history_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.device_groups(id) ON DELETE CASCADE;


--
-- Name: group_alert_history group_alert_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_alert_history
    ADD CONSTRAINT group_alert_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: group_available_apps group_available_apps_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_available_apps
    ADD CONSTRAINT group_available_apps_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.device_groups(id) ON DELETE CASCADE;


--
-- Name: installed_apps installed_apps_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_apps
    ADD CONSTRAINT installed_apps_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- Name: system_configs system_configs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_configs
    ADD CONSTRAINT system_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: uem_computer_status_history uem_computer_status_history_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_computer_status_history
    ADD CONSTRAINT uem_computer_status_history_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.uem_computers(id) ON DELETE CASCADE;


--
-- Name: uem_computers uem_computers_assigned_device_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_computers
    ADD CONSTRAINT uem_computers_assigned_device_user_id_fkey FOREIGN KEY (assigned_device_user_id) REFERENCES public.device_users(id) ON DELETE SET NULL;


--
-- Name: uem_computers uem_computers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_computers
    ADD CONSTRAINT uem_computers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: uem_installed_programs uem_installed_programs_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_installed_programs
    ADD CONSTRAINT uem_installed_programs_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.uem_computers(id) ON DELETE CASCADE;


--
-- Name: uem_remote_actions uem_remote_actions_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_remote_actions
    ADD CONSTRAINT uem_remote_actions_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.uem_computers(id) ON DELETE CASCADE;


--
-- Name: uem_remote_actions uem_remote_actions_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uem_remote_actions
    ADD CONSTRAINT uem_remote_actions_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict ghowFSTXZMwetSP9wpJuKAGvzQAqxR0Qds9jyayx4ERiUq43meFmfwA0idek5Ud

