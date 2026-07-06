import { collections } from '../index';
import type { AdminUserDoc } from '../types';

/** Access to the single admin login account (see seedAdminUser in db/index). */
export const adminRepo = {
  async findByEmail(email: string): Promise<AdminUserDoc | null> {
    return collections.adminUsers().findOne({ _id: email.trim().toLowerCase() });
  },
};
