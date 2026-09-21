import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOperatorProfile } from './useOperatorProfile';
import {
  heartbeatPresence,
  listTeamPresenceBoard,
  markPresenceOffline,
  PRESENCE_EVENT,
  pruneStalePresence,
  resolvePresenceUserKey,
  setPresenceAvailability,
  type PresenceAwayReason,
  type PresenceModule,
  type PresenceAvailability,
  type TeamPresence,
  getPresence,
} from '../data/presenceStore';

const HEARTBEAT_MS = 20_000;

/** Publica o módulo atual e mantém heartbeat da presença. */
export function usePresenceSession(module: PresenceModule) {
  const { user } = useAuth();
  const { profile, photo } = useOperatorProfile();
  const userKey = resolvePresenceUserKey(user?.email, profile.displayName);

  useEffect(() => {
    heartbeatPresence({
      email: user?.email,
      displayName: profile.displayName,
      role: profile.role,
      photo,
      module,
    });

    const timer = window.setInterval(() => {
      heartbeatPresence({
        email: user?.email,
        displayName: profile.displayName,
        role: profile.role,
        photo,
        module,
      });
    }, HEARTBEAT_MS);

    function onUnload() {
      markPresenceOffline(user?.email, profile.displayName);
    }
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [module, user?.email, profile.displayName, profile.role, photo]);

  return { userKey };
}

export function useMyPresence() {
  const { user } = useAuth();
  const { profile } = useOperatorProfile();
  const userKey = resolvePresenceUserKey(user?.email, profile.displayName);
  const [mine, setMine] = useState<TeamPresence | null>(() => getPresence(userKey));

  useEffect(() => {
    function refresh() {
      setMine(getPresence(userKey));
    }
    refresh();
    window.addEventListener(PRESENCE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PRESENCE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userKey]);

  function setActive() {
    setPresenceAvailability({
      email: user?.email,
      displayName: profile.displayName,
      availability: 'active',
    });
  }

  function setAway(reason: PresenceAwayReason, note = '') {
    setPresenceAvailability({
      email: user?.email,
      displayName: profile.displayName,
      availability: 'away',
      awayReason: reason,
      awayNote: note,
    });
  }

  return { mine, userKey, setActive, setAway };
}

export function useTeamPresence() {
  const { user } = useAuth();
  const { profile } = useOperatorProfile();
  const userKey = resolvePresenceUserKey(user?.email, profile.displayName);
  const [rows, setRows] = useState<TeamPresence[]>(() => listTeamPresenceBoard(userKey));

  useEffect(() => {
    function refresh() {
      pruneStalePresence();
      setRows(listTeamPresenceBoard(userKey));
    }
    refresh();
    const timer = window.setInterval(refresh, HEARTBEAT_MS);
    window.addEventListener(PRESENCE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(PRESENCE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userKey]);

  return { rows, userKey };
}

export type { PresenceAvailability, PresenceAwayReason, PresenceModule, TeamPresence };
