#!/usr/bin/env python3
"""
YuiHime SQLite Database Web CRUD Server.

Serves a clean, premium Web UI to perform CRUD operations and execute SQL queries
on YuiHime's SQLite database (yuihime.db).

Usage:
  python3 tools/db_server.py --port 5500
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# Resolve database path following YuiHime's conventions
def resolve_db_path() -> Path:
    if os.environ.get("YUIHIME_DB_PATH"):
        p = Path(os.environ["YUIHIME_DB_PATH"])
        if p.exists():
            return p

    data_dir = os.environ.get("YUIHIME_DATA_DIR")
    if data_dir:
        p = Path(data_dir) / "yuihime.db"
        if p.exists():
            return p

    # Standard paths
    home = Path.home()
    candidates = [
        home / ".yuihime" / "data" / "yuihime.db",
        Path("/home/userland/.yuihime/data/yuihime.db"),
        Path(".yuihime") / "data" / "yuihime.db",
        Path("data") / "yuihime.db",
    ]
    for cand in candidates:
        if cand.exists():
            return cand
    return Path("/home/userland/.yuihime/data/yuihime.db")


DB_PATH = resolve_db_path()

# ──────────────────────────────────────────────────────────────────────────────
# HTML_CONTENT — Premium mobile-first UI
# ──────────────────────────────────────────────────────────────────────────────
HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#070913">
    <title>YuiHime DB Console</title>
    <meta name="description" content="YuiHime SQLite Database Console — CRUD & SQL runner.">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        /* ── Design Tokens ── */
        :root {
            --bg-base:        #070913;
            --bg-surface:     rgba(14, 17, 34, 0.75);
            --bg-surface-2:   rgba(22, 26, 50, 0.85);
            --bg-hover:       rgba(139, 92, 246, 0.08);
            --border:         rgba(139, 92, 246, 0.12);
            --border-focus:   rgba(139, 92, 246, 0.55);
            --border-subtle:  rgba(255, 255, 255, 0.05);
            --text-primary:   #f0f0f8;
            --text-secondary: #8b8fa8;
            --text-muted:     #4b4f6a;
            --accent:         #8b5cf6;
            --accent-2:       #ec4899;
            --accent-3:       #06b6d4;
            --success:        #10b981;
            --error:          #f43f5e;
            --warning:        #f59e0b;
            --font-sans:      'Plus Jakarta Sans', system-ui, sans-serif;
            --font-mono:      'JetBrains Mono', 'Fira Code', monospace;
            --radius-sm:      8px;
            --radius:         14px;
            --radius-lg:      20px;
            --nav-h:          68px;
            --header-h:       58px;
            --shadow-glow:    0 0 30px rgba(139, 92, 246, 0.18);
        }

        /* ── Reset & Base ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html { scroll-behavior: smooth; }

        body {
            background: var(--bg-base);
            background-image:
                radial-gradient(ellipse 80% 60% at 10% 0%, rgba(139, 92, 246, 0.2) 0%, transparent 60%),
                radial-gradient(ellipse 60% 50% at 90% 100%, rgba(236, 72, 153, 0.14) 0%, transparent 60%),
                radial-gradient(ellipse 40% 40% at 50% 50%, rgba(6, 182, 212, 0.04) 0%, transparent 70%);
            color: var(--text-primary);
            font-family: var(--font-sans);
            min-height: 100dvh;
            overflow-x: hidden;
        }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.3); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(139, 92, 246, 0.55); }

        /* ── Header ── */
        header {
            position: sticky;
            top: 0;
            z-index: 200;
            height: var(--header-h);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 1.25rem;
            background: rgba(7, 9, 19, 0.88);
            backdrop-filter: blur(20px) saturate(1.5);
            border-bottom: 1px solid var(--border);
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            font-size: 1.05rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            background: linear-gradient(120deg, #a78bfa 0%, #ec4899 60%, #06b6d4 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .logo-icon { font-size: 1.25rem; }

        .db-badge {
            font-size: 0.68rem;
            font-family: var(--font-mono);
            color: var(--text-secondary);
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border-subtle);
            border-radius: 99px;
            padding: 0.28rem 0.75rem;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* ── App Shell ── */
        .app-shell {
            display: flex;
            height: calc(100dvh - var(--header-h));
        }

        /* ── Sidebar ── */
        .sidebar {
            width: 280px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            border-right: 1px solid var(--border);
            background: rgba(7, 9, 19, 0.5);
            overflow: hidden;
        }

        .sidebar-header {
            padding: 1rem;
            border-bottom: 1px solid var(--border-subtle);
        }

        .sidebar-title {
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-muted);
            margin-bottom: 0.65rem;
        }

        .search-box {
            position: relative;
        }

        .search-box input {
            width: 100%;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            padding: 0.5rem 0.75rem 0.5rem 2rem;
            color: var(--text-primary);
            font-family: var(--font-sans);
            font-size: 0.82rem;
            outline: none;
            transition: border-color 0.2s, background 0.2s;
        }

        .search-box input:focus {
            border-color: var(--border-focus);
            background: rgba(139, 92, 246, 0.06);
        }

        .search-icon {
            position: absolute;
            left: 0.6rem;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            font-size: 0.85rem;
            pointer-events: none;
        }

        .table-list {
            flex: 1;
            overflow-y: auto;
            padding: 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
        }

        .table-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.65rem 0.9rem;
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: all 0.18s;
            border: 1px solid transparent;
            gap: 0.5rem;
        }

        .table-item:hover {
            background: var(--bg-hover);
            border-color: rgba(139, 92, 246, 0.2);
        }

        .table-item.active {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.1) 100%);
            border-color: rgba(139, 92, 246, 0.4);
        }

        .table-name {
            font-size: 0.88rem;
            font-weight: 500;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .table-item.active .table-name { font-weight: 700; color: #c4b5fd; }

        .row-count {
            font-size: 0.7rem;
            font-family: var(--font-mono);
            color: var(--text-muted);
            background: rgba(0, 0, 0, 0.35);
            padding: 0.15rem 0.45rem;
            border-radius: 6px;
            flex-shrink: 0;
        }

        .table-item.active .row-count { color: var(--accent); }

        /* ── Main Area ── */
        .main {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* ── Tabs (desktop) ── */
        .tab-bar {
            display: flex;
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(7, 9, 19, 0.4);
            padding: 0 1rem;
            gap: 0.25rem;
            flex-shrink: 0;
        }

        .tab-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            font-family: var(--font-sans);
            font-size: 0.82rem;
            font-weight: 600;
            padding: 0.75rem 1rem;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }

        .tab-btn:hover { color: var(--text-primary); }

        .tab-btn.active {
            color: var(--accent);
            border-bottom-color: var(--accent);
        }

        /* ── Pane Content ── */
        .pane {
            flex: 1;
            overflow-y: auto;
            padding: 1.25rem;
            display: none;
        }

        .pane.active { display: block; }

        /* ── Card ── */
        .card {
            background: var(--bg-surface);
            backdrop-filter: blur(20px);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 1.25rem;
            transition: border-color 0.2s;
        }

        .card + .card { margin-top: 1rem; }

        .card-title {
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-muted);
            padding-bottom: 0.75rem;
            margin-bottom: 0.75rem;
            border-bottom: 1px solid var(--border-subtle);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        /* ── SQL Console ── */
        .sql-area {
            width: 100%;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            padding: 0.85rem;
            color: var(--text-primary);
            font-family: var(--font-mono);
            font-size: 0.85rem;
            line-height: 1.6;
            outline: none;
            resize: vertical;
            min-height: 110px;
            transition: border-color 0.2s, background 0.2s;
        }

        .sql-area:focus {
            border-color: var(--border-focus);
            background: rgba(0, 0, 0, 0.65);
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
        }

        /* ── Buttons ── */
        .btn-row {
            display: flex;
            gap: 0.5rem;
            justify-content: flex-end;
            margin-top: 0.75rem;
            flex-wrap: wrap;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.55rem 1.15rem;
            border-radius: var(--radius-sm);
            border: none;
            font-family: var(--font-sans);
            font-size: 0.83rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            white-space: nowrap;
            user-select: none;
        }

        .btn-primary {
            background: linear-gradient(135deg, #7c3aed, #a855f7);
            color: #fff;
            box-shadow: 0 2px 12px rgba(139, 92, 246, 0.35);
        }

        .btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
        }

        .btn-primary:active { transform: translateY(0); }

        .btn-ghost {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-subtle);
            color: var(--text-secondary);
        }

        .btn-ghost:hover {
            background: rgba(255, 255, 255, 0.09);
            color: var(--text-primary);
        }

        .btn-danger {
            background: rgba(244, 63, 94, 0.12);
            border: 1px solid rgba(244, 63, 94, 0.25);
            color: #f43f5e;
        }

        .btn-danger:hover {
            background: rgba(244, 63, 94, 0.22);
        }

        .btn-success {
            background: rgba(16, 185, 129, 0.12);
            border: 1px solid rgba(16, 185, 129, 0.25);
            color: #10b981;
        }

        /* ── Toolbar ── */
        .toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            flex-wrap: wrap;
            margin-bottom: 1rem;
        }

        .toolbar-title {
            font-size: 1rem;
            font-weight: 800;
            letter-spacing: -0.02em;
        }

        .toolbar-right { display: flex; gap: 0.5rem; align-items: center; }

        /* ── Data Table ── */
        .table-wrapper {
            overflow-x: auto;
            border-radius: var(--radius-sm);
            border: 1px solid var(--border-subtle);
            background: rgba(0, 0, 0, 0.2);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.83rem;
        }

        thead { position: sticky; top: 0; z-index: 10; }

        th {
            background: rgba(14, 17, 34, 0.95);
            padding: 0.75rem 1rem;
            text-align: left;
            color: var(--text-muted);
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            border-bottom: 1px solid var(--border-subtle);
            white-space: nowrap;
        }

        td {
            padding: 0.7rem 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            max-width: 220px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--text-primary);
            vertical-align: middle;
            cursor: pointer;
        }

        td.null-val { color: var(--text-muted); font-style: italic; font-size: 0.78rem; }

        tr:hover td { background: rgba(255, 255, 255, 0.02); }

        .actions-cell {
            display: flex;
            gap: 0.35rem;
            min-width: 72px;
            cursor: default;
        }

        .icon-btn {
            background: none;
            border: none;
            border-radius: 6px;
            padding: 0.3rem 0.4rem;
            cursor: pointer;
            color: var(--text-muted);
            font-size: 0.95rem;
            transition: all 0.15s;
            line-height: 1;
        }

        .icon-btn:hover { background: rgba(255, 255, 255, 0.07); color: var(--text-primary); }
        .icon-btn.danger:hover { background: rgba(244, 63, 94, 0.14); color: var(--error); }

        /* ── Pagination ── */
        .pagination {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 0 0;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .pagination-info {
            font-size: 0.78rem;
            color: var(--text-muted);
        }

        .page-btns { display: flex; gap: 0.35rem; }

        .page-btn {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            color: var(--text-secondary);
            font-family: var(--font-sans);
            font-size: 0.8rem;
            font-weight: 600;
            padding: 0.35rem 0.65rem;
            cursor: pointer;
            transition: all 0.15s;
        }

        .page-btn:hover, .page-btn.active {
            background: rgba(139, 92, 246, 0.15);
            border-color: rgba(139, 92, 246, 0.35);
            color: var(--accent);
        }

        .page-btn:disabled {
            opacity: 0.35;
            cursor: default;
            pointer-events: none;
        }

        /* ── Empty State ── */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.85rem;
            padding: 4rem 2rem;
            color: var(--text-muted);
            text-align: center;
            border: 1px dashed rgba(255, 255, 255, 0.07);
            border-radius: var(--radius);
            min-height: 250px;
        }

        .empty-state-icon { font-size: 2.5rem; opacity: 0.5; }
        .empty-state p { font-size: 0.9rem; max-width: 280px; line-height: 1.6; }

        /* ── Modal ── */
        .modal-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.72);
            backdrop-filter: blur(10px);
            z-index: 500;
            align-items: flex-end;
            justify-content: center;
        }

        .modal-overlay.open { display: flex; }

        .modal-sheet {
            background: #0d0f1e;
            border: 1px solid var(--border);
            border-radius: var(--radius-lg) var(--radius-lg) 0 0;
            width: 100%;
            max-width: 680px;
            max-height: 92dvh;
            display: flex;
            flex-direction: column;
            animation: slideUp 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
        }

        .modal-handle {
            display: flex;
            justify-content: center;
            padding: 0.75rem;
            flex-shrink: 0;
        }

        .handle-bar {
            width: 40px;
            height: 4px;
            background: rgba(255, 255, 255, 0.12);
            border-radius: 99px;
        }

        .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 1.25rem 0.85rem;
            flex-shrink: 0;
            border-bottom: 1px solid var(--border-subtle);
        }

        .modal-header h3 {
            font-size: 1rem;
            font-weight: 800;
            letter-spacing: -0.01em;
        }

        .modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 1.25rem;
        }

        .modal-footer {
            display: flex;
            gap: 0.5rem;
            justify-content: flex-end;
            padding: 1rem 1.25rem;
            border-top: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }

        /* ── Form Fields ── */
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
            margin-bottom: 0.9rem;
        }

        .form-group label {
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            color: var(--text-secondary);
        }

        .form-group label .pk-badge {
            font-size: 0.65rem;
            background: rgba(245, 158, 11, 0.15);
            color: var(--warning);
            border: 1px solid rgba(245, 158, 11, 0.25);
            border-radius: 4px;
            padding: 0 0.35rem;
            margin-left: 0.35rem;
        }

        .form-input, .form-textarea {
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            font-family: var(--font-sans);
            font-size: 0.88rem;
            outline: none;
            transition: all 0.18s;
            width: 100%;
        }

        .form-input  { padding: 0.6rem 0.85rem; }
        .form-textarea { padding: 0.6rem 0.85rem; font-family: var(--font-mono); font-size: 0.8rem; resize: vertical; min-height: 80px; }

        .form-input:focus, .form-textarea:focus {
            border-color: var(--border-focus);
            background: rgba(0, 0, 0, 0.6);
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
        }

        .form-input[readonly], .form-textarea[readonly] {
            opacity: 0.45;
            cursor: not-allowed;
        }

        /* ── Detail Body ── */
        .detail-field {
            margin-bottom: 1rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .detail-field:last-child { border-bottom: none; }

        .detail-label {
            font-size: 0.68rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.09em;
            color: var(--accent);
            margin-bottom: 0.4rem;
        }

        .detail-value {
            font-size: 0.875rem;
            line-height: 1.65;
            word-break: break-all;
            white-space: pre-wrap;
            background: rgba(0, 0, 0, 0.3);
            padding: 0.6rem 0.8rem;
            border-radius: var(--radius-sm);
            border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .detail-value.json {
            font-family: var(--font-mono);
            font-size: 0.78rem;
            color: #c4b5fd;
            background: rgba(0, 0, 0, 0.5);
        }

        .detail-value.null-val { color: var(--text-muted); font-style: italic; }

        /* ── Toast ── */
        #toast {
            position: fixed;
            bottom: calc(var(--nav-h) + 1rem);
            left: 50%;
            transform: translateX(-50%) translateY(12px);
            background: rgba(30, 24, 50, 0.96);
            border: 1px solid rgba(139, 92, 246, 0.35);
            color: var(--text-primary);
            padding: 0.65rem 1.35rem;
            border-radius: 99px;
            font-size: 0.85rem;
            font-weight: 600;
            z-index: 9999;
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
            white-space: nowrap;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.03);
        }

        #toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        #toast.error { border-color: rgba(244, 63, 94, 0.4); }
        #toast.success { border-color: rgba(16, 185, 129, 0.4); }

        /* ── Loading Spinner ── */
        .loading-row {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 3rem;
            gap: 0.75rem;
            color: var(--text-muted);
            font-size: 0.85rem;
        }

        .spinner {
            width: 20px;
            height: 20px;
            border: 2px solid rgba(139, 92, 246, 0.2);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Mobile Bottom Nav ── */
        .bottom-nav {
            display: none;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: var(--nav-h);
            background: rgba(7, 9, 19, 0.96);
            backdrop-filter: blur(24px) saturate(1.5);
            border-top: 1px solid var(--border);
            z-index: 300;
            padding: 0 0.5rem;
            padding-bottom: env(safe-area-inset-bottom);
        }

        .nav-inner {
            display: flex;
            align-items: center;
            justify-content: space-around;
            height: 100%;
        }

        .nav-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.2rem;
            padding: 0.4rem 1rem;
            border-radius: var(--radius-sm);
            background: none;
            border: none;
            color: var(--text-muted);
            font-family: var(--font-sans);
            font-size: 0.65rem;
            font-weight: 600;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            transition: all 0.18s;
            flex: 1;
            max-width: 100px;
            position: relative;
        }

        .nav-btn .nav-icon {
            font-size: 1.45rem;
            line-height: 1;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .nav-btn.active { color: var(--accent); }
        .nav-btn.active .nav-icon { transform: scale(1.18) translateY(-1px); }

        .nav-btn::after {
            content: '';
            position: absolute;
            bottom: -0.4rem;
            left: 50%;
            transform: translateX(-50%) scaleX(0);
            width: 22px;
            height: 2px;
            background: var(--accent);
            border-radius: 1px;
            transition: transform 0.2s;
        }

        .nav-btn.active::after { transform: translateX(-50%) scaleX(1); }

        /* ── Mobile Pane Toggle ── */
        @media (max-width: 768px) {
            body { padding-bottom: var(--nav-h); }

            .bottom-nav { display: block; }

            .app-shell { flex-direction: column; height: auto; min-height: calc(100dvh - var(--header-h) - var(--nav-h)); }

            .sidebar {
                width: 100%;
                border-right: none;
                border-bottom: none;
                display: none;
                max-height: 60dvh;
            }

            .sidebar.m-active { display: flex; }

            .tab-bar { display: none; }

            .main { overflow: visible; }

            .pane { display: none; padding: 0.85rem; }
            .pane.active { display: block; }

            .toolbar-title { font-size: 0.95rem; }

            .db-badge { max-width: 140px; }

            th, td { padding: 0.55rem 0.75rem; }

            table { font-size: 0.8rem; }

            td { max-width: 140px; }

            .btn { padding: 0.55rem 0.9rem; font-size: 0.8rem; }

            .modal-sheet { max-width: 100%; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }

            #toast { bottom: calc(var(--nav-h) + 0.75rem); font-size: 0.8rem; }
        }

        /* ── Desktop: hide bottom nav, show sidebar always ── */
        @media (min-width: 769px) {
            .sidebar { display: flex !important; }
            .pane { display: none; }
            .pane.active { display: block; }
        }

        /* ── SQL Result Status ── */
        .result-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.4rem 0.85rem;
            border-radius: 99px;
            font-size: 0.8rem;
            font-weight: 700;
        }

        .result-badge.ok  { background: rgba(16, 185, 129, 0.12); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.25); }
        .result-badge.err { background: rgba(244, 63, 94, 0.12);  color: var(--error);   border: 1px solid rgba(244, 63, 94, 0.25);  }

        /* ── Misc ── */
        .divider { height: 1px; background: var(--border-subtle); margin: 0.75rem 0; }

        .tag {
            display: inline-block;
            padding: 0.15rem 0.45rem;
            border-radius: 5px;
            font-size: 0.68rem;
            font-weight: 700;
            font-family: var(--font-mono);
        }

        .tag-pk { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    </style>
</head>
<body>
<!-- ── Header ── -->
<header>
    <div class="logo">
        <span class="logo-icon">🌸</span>
        <span>YuiHime DB</span>
    </div>
    <div class="db-badge" id="db-path-label">Connecting…</div>
</header>

<!-- ── App Shell ── -->
<div class="app-shell">

    <!-- Sidebar: Table List -->
    <div class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-title">📂 Tables</div>
            <div class="search-box">
                <span class="search-icon">🔍</span>
                <input type="text" id="table-search" placeholder="Search tables…" oninput="filterTables(this.value)">
            </div>
        </div>
        <ul class="table-list" id="table-list">
            <li class="loading-row"><div class="spinner"></div> Loading…</li>
        </ul>
    </div>

    <!-- Main area -->
    <div class="main">

        <!-- Desktop Tab Bar -->
        <div class="tab-bar">
            <button class="tab-btn active" id="dtab-viewer" onclick="switchDesktopTab('viewer')">🗄️ Data Viewer</button>
            <button class="tab-btn"        id="dtab-sql"    onclick="switchDesktopTab('sql')">⚡ SQL Console</button>
        </div>

        <!-- Pane: Data Viewer -->
        <div class="pane active" id="pane-viewer">
            <div id="empty-state-wrap">
                <div class="empty-state">
                    <div class="empty-state-icon">🗄️</div>
                    <p>Select a table from the list to view and edit its data.</p>
                </div>
            </div>

            <div id="viewer-content" style="display:none;">
                <div class="toolbar">
                    <div class="toolbar-title" id="viewer-title">—</div>
                    <div class="toolbar-right">
                        <button class="btn btn-ghost" onclick="refreshTable()" title="Refresh">🔄</button>
                        <button class="btn btn-primary" onclick="openInsertModal()">＋ Add Row</button>
                    </div>
                </div>

                <div class="card" style="padding: 0;">
                    <div class="table-wrapper">
                        <table id="data-table">
                            <thead id="data-thead"></thead>
                            <tbody id="data-tbody"></tbody>
                        </table>
                    </div>
                    <div class="pagination" id="pagination" style="padding: 0.75rem 1rem;">
                        <span class="pagination-info" id="page-info"></span>
                        <div class="page-btns" id="page-btns"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Pane: SQL Console -->
        <div class="pane" id="pane-sql">
            <div class="card">
                <div class="card-title">⚡ SQL Query Runner</div>
                <textarea class="sql-area" id="sql-input" rows="5" placeholder="SELECT * FROM identities LIMIT 20;
-- Ctrl+Enter to run"></textarea>
                <div class="btn-row">
                    <button class="btn btn-ghost" onclick="clearSQL()">✕ Clear</button>
                    <button class="btn btn-primary" onclick="runSQL()">▶ Execute</button>
                </div>
            </div>

            <div id="sql-result-wrap" style="display:none; margin-top: 1rem;">
                <div class="card">
                    <div class="card-title" id="sql-result-title">Query Result</div>
                    <div class="table-wrapper" id="sql-result-table-wrap">
                        <table id="sql-result-table">
                            <thead id="sql-result-thead"></thead>
                            <tbody id="sql-result-tbody"></tbody>
                        </table>
                    </div>
                    <div id="sql-result-msg"></div>
                </div>
            </div>
        </div>

    </div><!-- .main -->
</div><!-- .app-shell -->

<!-- ── Mobile Bottom Nav ── -->
<nav class="bottom-nav">
    <div class="nav-inner">
        <button class="nav-btn active" id="mnav-tables" onclick="mobileNav('tables')">
            <span class="nav-icon">📁</span>
            <span>Tables</span>
        </button>
        <button class="nav-btn" id="mnav-viewer" onclick="mobileNav('viewer')">
            <span class="nav-icon">🗄️</span>
            <span>Viewer</span>
        </button>
        <button class="nav-btn" id="mnav-sql" onclick="mobileNav('sql')">
            <span class="nav-icon">⚡</span>
            <span>SQL</span>
        </button>
    </div>
</nav>

<!-- ── CRUD Modal (Bottom Sheet) ── -->
<div class="modal-overlay" id="crud-modal">
    <div class="modal-sheet">
        <div class="modal-handle"><div class="handle-bar"></div></div>
        <div class="modal-header">
            <h3 id="crud-title">Insert Row</h3>
            <button class="icon-btn" onclick="closeCrudModal()">✕</button>
        </div>
        <form id="crud-form" onsubmit="saveRow(event)">
            <div class="modal-body" id="crud-fields"></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-ghost" onclick="closeCrudModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" id="crud-submit">Save</button>
            </div>
        </form>
    </div>
</div>

<!-- ── Detail Modal (Bottom Sheet) ── -->
<div class="modal-overlay" id="detail-modal">
    <div class="modal-sheet">
        <div class="modal-handle"><div class="handle-bar"></div></div>
        <div class="modal-header">
            <h3 id="detail-modal-title">Row Details</h3>
            <button class="icon-btn" onclick="closeDetailModal()">✕</button>
        </div>
        <div class="modal-body" id="detail-modal-body"></div>
        <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeDetailModal()">Close</button>
        </div>
    </div>
</div>

<!-- ── Toast ── -->
<div id="toast"></div>

<script>
/* ─────────────────────── State ─────────────────────── */
let currentTable   = '';
let currentColumns = [];
let primaryKeys    = [];
let allRows        = [];
let editRowData    = null;

const PAGE_SIZE    = 50;
let currentPage    = 0;

let allTables      = [];          // [{name, count}]
let activeDesktopTab = 'viewer';
let activeMobileNav  = 'tables';

/* ─────────────────────── Toast ─────────────────────── */
let toastTimer;
function toast(msg, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

/* ─────────────────────── Fetch helper ─────────────────────── */
async function api(url, opts = {}) {
    try {
        const r = await fetch(url, opts);
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Request failed');
        return d;
    } catch (e) {
        toast('⚠ ' + e.message, 'error');
        return null;
    }
}

/* ─────────────────────── Navigation ─────────────────────── */
function switchDesktopTab(tab) {
    activeDesktopTab = tab;
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    document.getElementById('pane-' + tab).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('dtab-' + tab).classList.add('active');
}

function mobileNav(section) {
    activeMobileNav = section;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('mnav-' + section).classList.add('active');

    const sidebar = document.getElementById('sidebar');
    const paneViewer = document.getElementById('pane-viewer');
    const paneSQL    = document.getElementById('pane-sql');

    sidebar.classList.remove('m-active');
    paneViewer.classList.remove('active');
    paneSQL.classList.remove('active');

    if (section === 'tables') {
        sidebar.classList.add('m-active');
    } else if (section === 'viewer') {
        paneViewer.classList.add('active');
    } else if (section === 'sql') {
        paneSQL.classList.add('active');
    }
}

/* ─────────────────────── Init ─────────────────────── */
async function init() {
    const data = await api('/api/tables');
    if (!data) return;
    document.getElementById('db-path-label').textContent = data.db_path;
    allTables = data.tables;
    renderTableList(allTables);
}

function renderTableList(tables) {
    const list = document.getElementById('table-list');
    list.innerHTML = '';
    if (!tables.length) {
        list.innerHTML = '<li style="padding:1rem; color:var(--text-muted); font-size:0.83rem; text-align:center;">No tables found.</li>';
        return;
    }
    tables.forEach(t => {
        const li = document.createElement('li');
        li.className = 'table-item' + (t.name === currentTable ? ' active' : '');
        li.innerHTML = `<span class="table-name">${esc(t.name)}</span><span class="row-count">${t.count}</span>`;
        li.onclick = () => selectTable(t.name, li);
        list.appendChild(li);
    });
}

function filterTables(q) {
    const filtered = q ? allTables.filter(t => t.name.toLowerCase().includes(q.toLowerCase())) : allTables;
    renderTableList(filtered);
}

/* ─────────────────────── Select Table ─────────────────────── */
async function selectTable(name) {
    currentTable = name;
    document.querySelectorAll('.table-item').forEach(el => el.classList.remove('active'));
    const items = document.querySelectorAll('.table-item');
    items.forEach(el => { if (el.querySelector('.table-name')?.textContent === name) el.classList.add('active'); });

    document.getElementById('viewer-title').textContent = name;
    document.getElementById('empty-state-wrap').style.display = 'none';
    document.getElementById('viewer-content').style.display = 'block';

    showLoading();

    const data = await api('/api/table/' + encodeURIComponent(name));
    if (!data) return;
    currentColumns = data.columns;
    primaryKeys    = data.primary_keys;
    allRows        = data.rows;
    currentPage    = 0;
    renderPage();

    // On mobile: auto-switch to viewer pane
    if (window.innerWidth <= 768) mobileNav('viewer');
    else switchDesktopTab('viewer');
}

function refreshTable() {
    if (currentTable) selectTable(currentTable);
}

/* ─────────────────────── Table Render ─────────────────────── */
function showLoading() {
    document.getElementById('data-tbody').innerHTML =
        `<tr><td colspan="99" style="padding:0"><div class="loading-row"><div class="spinner"></div> Loading…</div></td></tr>`;
}

function renderPage() {
    const start = currentPage * PAGE_SIZE;
    const pageRows = allRows.slice(start, start + PAGE_SIZE);
    renderHead(currentColumns);
    renderBody(currentColumns, pageRows, start);
    renderPagination();
}

function renderHead(cols) {
    const thead = document.getElementById('data-thead');
    const tr = document.createElement('tr');
    const thA = document.createElement('th');
    thA.textContent = '···';
    tr.appendChild(thA);
    cols.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c;
        if (primaryKeys.includes(c)) {
            const badge = document.createElement('span');
            badge.className = 'tag tag-pk';
            badge.textContent = 'PK';
            badge.style.marginLeft = '0.35rem';
            th.appendChild(badge);
        }
        tr.appendChild(th);
    });
    thead.innerHTML = '';
    thead.appendChild(tr);
}

function renderBody(cols, rows, startIdx) {
    const tbody = document.getElementById('data-tbody');
    tbody.innerHTML = '';
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" style="text-align:center; padding:2.5rem; color:var(--text-muted)">No rows found.</td></tr>`;
        return;
    }
    rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        const tdA = document.createElement('td');
        tdA.className = 'actions-cell';
        tdA.style.cursor = 'default';
        tdA.innerHTML = `
            <button class="icon-btn" onclick="openEditModal(${startIdx + i})" title="Edit">✏️</button>
            <button class="icon-btn danger" onclick="deleteRow(${startIdx + i})" title="Delete">🗑</button>
        `;
        tr.appendChild(tdA);
        cols.forEach(c => {
            const td = document.createElement('td');
            const val = r[c];
            if (val === null || val === undefined) {
                td.textContent = 'NULL';
                td.classList.add('null-val');
            } else {
                td.textContent = typeof val === 'object' ? JSON.stringify(val) : String(val);
            }
            td.onclick = () => openDetailModal(startIdx + i);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

function renderPagination() {
    const total = allRows.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const info  = document.getElementById('page-info');
    const btns  = document.getElementById('page-btns');

    const s = currentPage * PAGE_SIZE + 1;
    const e = Math.min((currentPage + 1) * PAGE_SIZE, total);
    info.textContent = `${s}–${e} of ${total} rows`;

    btns.innerHTML = '';
    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.textContent = '← Prev';
    prev.disabled = currentPage === 0;
    prev.onclick = () => { currentPage--; renderPage(); };
    btns.appendChild(prev);

    const next = document.createElement('button');
    next.className = 'page-btn';
    next.textContent = 'Next →';
    next.disabled = currentPage >= pages - 1;
    next.onclick = () => { currentPage++; renderPage(); };
    btns.appendChild(next);
}

/* ─────────────────────── Detail Modal ─────────────────────── */
function openDetailModal(idx) {
    const r = allRows[idx];
    if (!r) return;
    document.getElementById('detail-modal-title').textContent = `Row · ${currentTable}`;
    const body = document.getElementById('detail-modal-body');
    body.innerHTML = '';
    currentColumns.forEach(c => {
        const val = r[c];
        let display = val === null ? null : String(val);
        let isJson  = false;
        if (display && (display.startsWith('{') || display.startsWith('['))) {
            try { display = JSON.stringify(JSON.parse(display), null, 2); isJson = true; } catch {}
        }
        const div = document.createElement('div');
        div.className = 'detail-field';
        div.innerHTML = `
            <div class="detail-label">${esc(c)}${primaryKeys.includes(c) ? ' <span class="tag tag-pk">PK</span>' : ''}</div>
            <div class="detail-value${isJson ? ' json' : ''}${val === null ? ' null-val' : ''}">${esc(display ?? 'NULL')}</div>
        `;
        body.appendChild(div);
    });
    document.getElementById('detail-modal').classList.add('open');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('open');
}

/* ─────────────────────── CRUD Modal ─────────────────────── */
function openInsertModal() {
    editRowData = null;
    document.getElementById('crud-title').textContent = `Insert into ${currentTable}`;
    document.getElementById('crud-submit').textContent = 'Insert';
    buildFormFields(null);
    document.getElementById('crud-modal').classList.add('open');
}

function openEditModal(idx) {
    editRowData = allRows[idx];
    document.getElementById('crud-title').textContent = `Edit row · ${currentTable}`;
    document.getElementById('crud-submit').textContent = 'Save Changes';
    buildFormFields(editRowData);
    document.getElementById('crud-modal').classList.add('open');
}

function buildFormFields(rowData) {
    const container = document.getElementById('crud-fields');
    container.innerHTML = '';
    currentColumns.forEach(c => {
        const isPk  = primaryKeys.includes(c);
        const val   = rowData ? (rowData[c] === null ? '' : String(rowData[c])) : '';
        const longVal = val.length > 60 || val.includes('{') || val.includes('[') || val.includes('\\n');
        const useTA = longVal || ['habits', 'importantFacts', 'linkedAccounts', 'yuiPerspective'].includes(c);

        const grp = document.createElement('div');
        grp.className = 'form-group';

        const label = document.createElement('label');
        label.innerHTML = esc(c) + (isPk ? '<span class="pk-badge">PK</span>' : '');
        grp.appendChild(label);

        if (useTA) {
            const ta = document.createElement('textarea');
            ta.className   = 'form-textarea';
            ta.name        = c;
            ta.rows        = 4;
            ta.placeholder = isPk ? '(auto)' : 'NULL';
            ta.value       = val;
            if (isPk && rowData) ta.readOnly = true;
            grp.appendChild(ta);
        } else {
            const inp = document.createElement('input');
            inp.className   = 'form-input';
            inp.type        = 'text';
            inp.name        = c;
            inp.placeholder = isPk && !rowData ? '(auto)' : 'NULL';
            inp.value       = val;
            if (isPk && rowData) inp.readOnly = true;
            grp.appendChild(inp);
        }
        container.appendChild(grp);
    });
}

function closeCrudModal() {
    document.getElementById('crud-modal').classList.remove('open');
}

/* ─────────────────────── Save / Delete ─────────────────────── */
async function saveRow(e) {
    e.preventDefault();
    const form = document.getElementById('crud-form');
    const dataObj = {};
    currentColumns.forEach(c => {
        const el  = form.querySelector(`[name="${c}"]`);
        const val = el ? el.value : null;
        dataObj[c] = (val === '' || val === null) ? null : val;
    });
    const isEdit = !!editRowData;
    const payload = {
        data: dataObj,
        pk_vals: isEdit ? primaryKeys.reduce((a, k) => { a[k] = editRowData[k]; return a; }, {}) : null
    };
    const url = `/api/table/${encodeURIComponent(currentTable)}/${isEdit ? 'update' : 'insert'}`;
    const r = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r) {
        toast(isEdit ? '✅ Row updated' : '✅ Row inserted', 'success');
        closeCrudModal();
        await selectTable(currentTable);
        await init(); // refresh counts
    }
}

async function deleteRow(idx) {
    const r = allRows[idx];
    if (!r || !confirm('Delete this row?')) return;
    const payload = { pk_vals: primaryKeys.reduce((a, k) => { a[k] = r[k]; return a; }, {}) };
    const res = await api(`/api/table/${encodeURIComponent(currentTable)}/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (res) {
        toast('🗑 Row deleted', 'success');
        await selectTable(currentTable);
        await init();
    }
}

/* ─────────────────────── SQL Console ─────────────────────── */
function clearSQL() { document.getElementById('sql-input').value = ''; }

document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runSQL();
});

async function runSQL() {
    const sql = document.getElementById('sql-input').value.trim();
    if (!sql) return;
    const resultWrap = document.getElementById('sql-result-wrap');
    resultWrap.style.display = 'none';

    const r = await api('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql })
    });
    if (!r) return;

    resultWrap.style.display = 'block';
    const titleEl = document.getElementById('sql-result-title');
    const msgEl   = document.getElementById('sql-result-msg');
    const twrap   = document.getElementById('sql-result-table-wrap');
    msgEl.innerHTML = '';

    if (r.rows && r.rows.length > 0) {
        titleEl.textContent = `Result — ${r.rows.length} row${r.rows.length !== 1 ? 's' : ''}`;
        const cols = Object.keys(r.rows[0]);
        const thead = document.getElementById('sql-result-thead');
        const tbody = document.getElementById('sql-result-tbody');
        thead.innerHTML = '<tr>' + cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr>';
        tbody.innerHTML = r.rows.map(row =>
            '<tr>' + cols.map(c => {
                const v = row[c];
                if (v === null) return `<td class="null-val">NULL</td>`;
                return `<td>${esc(String(v))}</td>`;
            }).join('') + '</tr>'
        ).join('');
        twrap.style.display = 'block';
        toast('⚡ Query executed', 'success');
    } else {
        twrap.style.display = 'none';
        titleEl.textContent = 'Query Result';
        msgEl.innerHTML = `<div style="padding:1rem 0;">
            <span class="result-badge ok">✓ Success — ${r.changes ?? 0} row(s) affected</span>
        </div>`;
        toast('✅ Query executed', 'success');
        await init();
    }
}

/* ─────────────────────── Escape helper ─────────────────────── */
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/* ─────────────────────── Close modals on overlay click ─────────────────────── */
document.getElementById('crud-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeCrudModal(); });
document.getElementById('detail-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetailModal(); });

/* ─────────────────────── Start ─────────────────────── */
init();
</script>
</body>
</html>
"""


class YuiDBHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Keep stdout clean unless there's an error
        pass

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def send_html(self, html, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":
            self.send_html(HTML_CONTENT)
            return

        if url.path == "/api/tables":
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
                tables = []
                for row in cursor.fetchall():
                    name = row["name"]
                    c_cursor = conn.cursor()
                    c_cursor.execute(f"SELECT COUNT(*) as count FROM [{name}]")
                    cnt = c_cursor.fetchone()["count"]
                    tables.append({"name": name, "count": cnt})
                conn.close()
                self.send_json({"success": True, "tables": tables, "db_path": str(DB_PATH)})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        # match /api/table/<table_name>
        match = re.match(r"^/api/table/([^/]+)$", url.path)
        if match:
            table_name = match.group(1)
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                # Get Columns and PK
                cursor.execute(f"PRAGMA table_info([{table_name}])")
                info = cursor.fetchall()
                columns = [col["name"] for col in info]
                primary_keys = [col["name"] for col in info if col["pk"] > 0]

                # Get Rows (all, pagination handled client-side)
                cursor.execute(f"SELECT * FROM [{table_name}] LIMIT 2000")
                rows = [dict(r) for r in cursor.fetchall()]
                conn.close()

                self.send_json({
                    "success": True,
                    "columns": columns,
                    "primary_keys": primary_keys,
                    "rows": rows
                })
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        self.send_html("<h1>Not Found</h1>", 404)

    def do_POST(self):
        url = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length).decode("utf-8")

        try:
            req_data = json.loads(post_data) if post_data else {}
        except Exception:
            self.send_json({"success": False, "error": "Invalid JSON"}, 400)
            return

        # match /api/table/<table_name>/insert
        match_insert = re.match(r"^/api/table/([^/]+)/insert$", url.path)
        if match_insert:
            table_name = match_insert.group(1)
            data = req_data.get("data", {})
            if not data:
                self.send_json({"success": False, "error": "No data provided"}, 400)
                return

            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cols = list(data.keys())
                vals = list(data.values())
                placeholders = ", ".join(["?"] * len(cols))
                query = f"INSERT INTO [{table_name}] ({', '.join(cols)}) VALUES ({placeholders})"
                cursor.execute(query, vals)
                conn.commit()
                conn.close()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        # match /api/table/<table_name>/update
        match_update = re.match(r"^/api/table/([^/]+)/update$", url.path)
        if match_update:
            table_name = match_update.group(1)
            data = req_data.get("data", {})
            pk_vals = req_data.get("pk_vals", {})
            if not data or not pk_vals:
                self.send_json({"success": False, "error": "Missing data or pk_vals"}, 400)
                return

            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                set_clause = ", ".join([f"[{k}] = ?" for k in data.keys()])
                where_clause = " AND ".join([f"[{k}] = ?" for k in pk_vals.keys()])
                vals = list(data.values()) + list(pk_vals.values())
                query = f"UPDATE [{table_name}] SET {set_clause} WHERE {where_clause}"
                cursor.execute(query, vals)
                conn.commit()
                conn.close()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        # match /api/table/<table_name>/delete
        match_delete = re.match(r"^/api/table/([^/]+)/delete$", url.path)
        if match_delete:
            table_name = match_delete.group(1)
            pk_vals = req_data.get("pk_vals", {})
            if not pk_vals:
                self.send_json({"success": False, "error": "Missing pk_vals"}, 400)
                return

            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                where_clause = " AND ".join([f"[{k}] = ?" for k in pk_vals.keys()])
                vals = list(pk_vals.values())
                query = f"DELETE FROM [{table_name}] WHERE {where_clause}"
                cursor.execute(query, vals)
                conn.commit()
                conn.close()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        # match /api/query
        if url.path == "/api/query":
            query = req_data.get("query", "").strip()
            if not query:
                self.send_json({"success": False, "error": "Empty query"}, 400)
                return

            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(query)

                upper_q = query.upper()
                if upper_q.startswith("SELECT") or upper_q.startswith("PRAGMA") or upper_q.startswith("EXPLAIN"):
                    rows = [dict(r) for r in cursor.fetchall()]
                    conn.close()
                    self.send_json({"success": True, "rows": rows})
                else:
                    conn.commit()
                    changes = conn.total_changes
                    conn.close()
                    self.send_json({"success": True, "changes": changes})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        self.send_html("<h1>Not Found</h1>", 404)


def main():
    parser = argparse.ArgumentParser(description="YuiHime DB Web Controller")
    parser.add_argument("--port", type=int, default=5500, help="Port to run the server on")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"Error: Database file does not exist at '{DB_PATH}'", file=sys.stderr)
        print("Please check your YUIHIME_DB_PATH or YUIHIME_DATA_DIR environment variables.", file=sys.stderr)
        sys.exit(1)

    print(f"Starting YuiHime DB CRUD Server...")
    print(f"Connected to DB: {DB_PATH}")
    print(f"Server running on: http://localhost:{args.port}")

    server = HTTPServer(("0.0.0.0", args.port), YuiDBHTTPHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()


if __name__ == "__main__":
    main()
