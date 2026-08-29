import { useCallback, useEffect, useState } from 'react';
import {
  createAssignment,
  deleteAssignment,
  getAllAssignments,
  toggleAssignmentStatus,
  updateAssignment,
} from '../services/assignmentService';
import { getModules, initializeStorage } from '../services/storage';
import { Assignment, Module } from '../types';

export interface UseAssignmentsReturn {
  assignments: Assignment[];
  modules: Module[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addAssignment: (
    input: Omit<Assignment, 'id' | 'updatedAt' | 'isSynced'>
  ) => Promise<Assignment>;
  editAssignment: (
    id: string,
    updates: Partial<Omit<Assignment, 'id' | 'updatedAt' | 'isSynced'>>
  ) => Promise<Assignment | null>;
  removeAssignment: (id: string) => Promise<boolean>;
  toggleStatus: (id: string) => Promise<Assignment | null>;
}

export function useAssignments(): UseAssignmentsReturn {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const initResult = await initializeStorage();
      setModules(initResult.modules);
      setAssignments(initResult.assignments);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load assignments';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [fetchedAssignments, fetchedModules] = await Promise.all([
        getAllAssignments(),
        getModules(),
      ]);
      setAssignments(fetchedAssignments);
      setModules(fetchedModules);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to refresh assignments';
      setError(message);
    }
  }, []);

  const addAssignment = useCallback(
    async (
      input: Omit<Assignment, 'id' | 'updatedAt' | 'isSynced'>
    ): Promise<Assignment> => {
      const created = await createAssignment(input);
      setAssignments((prev) => [created, ...prev]);
      return created;
    },
    []
  );

  const editAssignment = useCallback(
    async (
      id: string,
      updates: Partial<Omit<Assignment, 'id' | 'updatedAt' | 'isSynced'>>
    ): Promise<Assignment | null> => {
      const updated = await updateAssignment(id, updates);
      if (updated) {
        setAssignments((prev) =>
          prev.map((item) => (item.id === id ? updated : item))
        );
      }
      return updated;
    },
    []
  );

  const removeAssignment = useCallback(
    async (id: string): Promise<boolean> => {
      const success = await deleteAssignment(id);
      if (success) {
        setAssignments((prev) => prev.filter((item) => item.id !== id));
      }
      return success;
    },
    []
  );

  const toggleStatus = useCallback(
    async (id: string): Promise<Assignment | null> => {
      const updated = await toggleAssignmentStatus(id);
      if (updated) {
        setAssignments((prev) =>
          prev.map((item) => (item.id === id ? updated : item))
        );
      }
      return updated;
    },
    []
  );

  return {
    assignments,
    modules,
    isLoading,
    error,
    refresh,
    addAssignment,
    editAssignment,
    removeAssignment,
    toggleStatus,
  };
}
