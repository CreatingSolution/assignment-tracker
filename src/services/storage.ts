import AsyncStorage from '@react-native-async-storage/async-storage';
import { Assignment, Module, Mutation } from '../types';

export const STORAGE_KEYS = {
  ASSIGNMENTS: '@assignment_tracker/assignments_v1',
  MODULES: '@assignment_tracker/modules_v1',
  OUTBOX_MUTATIONS: '@assignment_tracker/outbox_mutations_v1',
  INITIALIZED: '@assignment_tracker/initialized_v1',
} as const;

export const INITIAL_MODULES: Module[] = [
  {
    id: 'mod-cs701',
    code: 'CS701',
    title: 'Advanced Machine Learning',
    color: '#3B82F6',
  },
  {
    id: 'mod-cs705',
    code: 'CS705',
    title: 'Cloud Computing & Distributed Systems',
    color: '#8B5CF6',
  },
];

export const INITIAL_ASSIGNMENTS: Assignment[] = [
  {
    id: 'assign-101',
    moduleId: 'mod-cs701',
    title: 'Neural Network Architecture & Hyperparameter Tuning',
    dueDate: '2026-09-15T23:59:59.000Z',
    priority: 'high',
    status: 'pending',
    updatedAt: 1724918400000,
    isSynced: true,
  },
  {
    id: 'assign-102',
    moduleId: 'mod-cs705',
    title: 'Raft Consensus Implementation & Benchmarking',
    dueDate: '2026-09-22T23:59:59.000Z',
    priority: 'medium',
    status: 'pending',
    updatedAt: 1724918400000,
    isSynced: true,
  },
];

/**
 * Initializes storage with initial sample data if not already present.
 */
export async function initializeStorage(): Promise<{
  modules: Module[];
  assignments: Assignment[];
}> {
  try {
    const isInitialized = await AsyncStorage.getItem(STORAGE_KEYS.INITIALIZED);

    if (!isInitialized) {
      await saveModules(INITIAL_MODULES);
      await saveAssignments(INITIAL_ASSIGNMENTS);
      await AsyncStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
      return { modules: INITIAL_MODULES, assignments: INITIAL_ASSIGNMENTS };
    }

    const [modules, assignments] = await Promise.all([
      getModules(),
      getAssignments(),
    ]);

    return { modules, assignments };
  } catch (error) {
    console.error('Failed to initialize storage:', error);
    return { modules: INITIAL_MODULES, assignments: INITIAL_ASSIGNMENTS };
  }
}

/**
 * Retrieves all assignments from AsyncStorage.
 */
export async function getAssignments(): Promise<Assignment[]> {
  try {
    const rawData = await AsyncStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
    if (!rawData) {
      return [];
    }
    const parsed: unknown = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      return parsed as Assignment[];
    }
    return [];
  } catch (error) {
    console.error('Failed to get assignments from storage:', error);
    return [];
  }
}

/**
 * Saves assignments array to AsyncStorage.
 */
export async function saveAssignments(assignments: Assignment[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.ASSIGNMENTS,
      JSON.stringify(assignments)
    );
  } catch (error) {
    console.error('Failed to save assignments to storage:', error);
    throw error;
  }
}

/**
 * Marks specific assignments as synced in local storage.
 */
export async function markAssignmentsSynced(assignmentIds: string[]): Promise<void> {
  try {
    const idSet = new Set(assignmentIds);
    const assignments = await getAssignments();
    const updated = assignments.map((item) =>
      idSet.has(item.id) ? { ...item, isSynced: true } : item
    );
    await saveAssignments(updated);
  } catch (error) {
    console.error('Failed to mark assignments as synced:', error);
    throw error;
  }
}

/**
 * Retrieves all modules from AsyncStorage.
 */
export async function getModules(): Promise<Module[]> {
  try {
    const rawData = await AsyncStorage.getItem(STORAGE_KEYS.MODULES);
    if (!rawData) {
      return [];
    }
    const parsed: unknown = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      return parsed as Module[];
    }
    return [];
  } catch (error) {
    console.error('Failed to get modules from storage:', error);
    return [];
  }
}

/**
 * Saves modules array to AsyncStorage.
 */
export async function saveModules(modules: Module[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.MODULES, JSON.stringify(modules));
  } catch (error) {
    console.error('Failed to save modules to storage:', error);
    throw error;
  }
}

/**
 * Adds a mutation to the outbox queue in AsyncStorage.
 */
export async function addMutation<T = unknown>(
  mutation: Omit<Mutation<T>, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: number;
  }
): Promise<Mutation<T>> {
  try {
    const newMutation: Mutation<T> = {
      id: mutation.id || `mut-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: mutation.type,
      entity: mutation.entity,
      data: mutation.data,
      createdAt: mutation.createdAt || Date.now(),
    };

    const currentMutations = await getPendingMutations();
    const updatedMutations = [...currentMutations, newMutation];

    await AsyncStorage.setItem(
      STORAGE_KEYS.OUTBOX_MUTATIONS,
      JSON.stringify(updatedMutations)
    );

    return newMutation;
  } catch (error) {
    console.error('Failed to add mutation to outbox queue:', error);
    throw error;
  }
}

/**
 * Retrieves all pending mutations from the outbox queue.
 */
export async function getPendingMutations(): Promise<Mutation[]> {
  try {
    const rawData = await AsyncStorage.getItem(STORAGE_KEYS.OUTBOX_MUTATIONS);
    if (!rawData) {
      return [];
    }
    const parsed: unknown = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      return parsed as Mutation[];
    }
    return [];
  } catch (error) {
    console.error('Failed to get pending mutations from storage:', error);
    return [];
  }
}

/**
 * Removes specific mutations by ID from the outbox queue.
 */
export async function removeMutations(mutationIds: string[]): Promise<void> {
  try {
    const idSet = new Set(mutationIds);
    const current = await getPendingMutations();
    const remaining = current.filter((m) => !idSet.has(m.id));
    await AsyncStorage.setItem(
      STORAGE_KEYS.OUTBOX_MUTATIONS,
      JSON.stringify(remaining)
    );
  } catch (error) {
    console.error('Failed to remove mutations from outbox queue:', error);
    throw error;
  }
}

/**
 * Clears all pending mutations from the outbox queue.
 */
export async function clearPendingMutations(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.OUTBOX_MUTATIONS);
  } catch (error) {
    console.error('Failed to clear pending mutations from storage:', error);
    throw error;
  }
}
