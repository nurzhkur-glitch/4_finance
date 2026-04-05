import { useEffect, useRef, useCallback } from "react";

const API_BASE = "/api";

export async function fetchFilters() {
  const res = await fetch(`${API_BASE}/filters`);
  if (!res.ok) throw new Error(`filters: ${res.status}`);
  return res.json();
}

export async function fetchData({ year, month, location } = {}) {
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  if (location) params.set("location", location);
  const res = await fetch(`${API_BASE}/data?${params}`);
  if (!res.ok) throw new Error(`data: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function fetchMonthlySummary(year) {
  const params = year ? `?year=${year}` : "";
  const res = await fetch(`${API_BASE}/monthly-summary${params}`);
  if (!res.ok) throw new Error(`monthly-summary: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function fetchLocationSummary({ year, month } = {}) {
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  const res = await fetch(`${API_BASE}/location-summary?${params}`);
  if (!res.ok) throw new Error(`location-summary: ${res.status}`);
  const json = await res.json();
  return json.data;
}

/**
 * WebSocket hook for NRT updates.
 * Calls `onDataChanged` whenever the backend pushes a data_changed event.
 * Auto-reconnects on disconnect with exponential backoff.
 */
export function useFinanceWebSocket(onDataChanged) {
  const cbRef = useRef(onDataChanged);
  cbRef.current = onDataChanged;

  useEffect(() => {
    let ws;
    let reconnectTimer;
    let attempt = 0;
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === "data_changed") {
            cbRef.current?.(msg);
          }
        } catch { /* ignore non-json */ }
      };

      ws.onclose = () => {
        if (unmounted) return;
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
}
