import { Assignment } from '../types';
import {
  addMutation,
  getAssignments,
  saveAssignments,
} from './storage';
import { syncPendingData } from './syncEngine';

/**
 * Retrieves all stored assignments.
 */
export async function getAllAssignments(): Promise<Assignment[]> {
  return getAssignments();
}

/**
 * Creates a new assignment locally and queues a CREATE mutation in the outbox.
 */
export async function createAssignment(
  input: Omit<Assignment, 'id' | 'updatedAt' | 'isSynced'>
): Promise<Assignment> {
  const newAssignment: Assignment = {
    ...input,
    id: `assign-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    updatedAt: Date.now(),
    isSynced: false,
  };

  const current = await getAssignments();
  const updatedList = [newAssignment, ...current];
  await saveAssignments(updatedList);

  // Queue mutation in outbox
  await addMutation({
    type: 'CREATE',
    entity: 'assignment',
    data: newAssignment,
  });

  // Non-blocking attempt to sync if online
  syncPendingData().catch(() => {});

  return newAssignment;
}

/**
 * Updates an existing assignment and queues an UPDATE mutation in the outbox.
 */
export async function updateAssignment(
  id: string,
  updates: Partial<Omit<Assignment, 'id' | 'updatedAt' | 'isSynced'>>
): Promise<Assignment | null> {
  const current = await getAssignments();
  const index = current.findIndex((item) => item.id === id);

  if (index === -1) {
    return null;
  }

  const updatedAssignment: Assignment = {
    ...current[index],
    ...updates,
    updatedAt: Date.now(),
    isSynced: false,
  };

  const updatedList = [...current];
  updatedList[index] = updatedAssignment;
  await saveAssignments(updatedList);

  // Queue mutation in outbox
  await addMutation({
    type: 'UPDATE',
    entity: 'assignment',
    data: updatedAssignment,
  });

  // Non-blocking attempt to sync if online
  syncPendingData().catch(() => {});

  return updatedAssignment;
}

/**
 * Deletes an assignment and queues a DELETE mutation in the outbox.
 */
export async function deleteAssignment(id: string): Promise<boolean> {
  const current = await getAssignments();
  const target = current.find((item) => item.id === id);

  if (!target) {
    return false;
  }

  const updatedList = current.filter((item) => item.id !== id);
  await saveAssignments(updatedList);

  // Queue mutation in outbox
  await addMutation({
    type: 'DELETE',
    entity: 'assignment',
    data: { id },
  });

  // Non-blocking attempt to sync if online
  syncPendingData().catch(() => {});

  return true;
}

/**
 * Toggles status between pending and completed.
 */
export async function toggleAssignmentStatus(
  id: string
): Promise<Assignment | null> {
  const current = await getAssignments();
  const target = current.find((item) => item.id === id);

  if (!target) {
    return null;
  }

  const nextStatus = target.status === 'completed' ? 'pending' : 'completed';
  return updateAssignment(id, { status: nextStatus });
}
