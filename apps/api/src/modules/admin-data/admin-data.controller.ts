import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PurgeService } from './purge.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';

/**
 * Admin → Data: the screen that replaces opening the database by hand.
 *
 * Everything soft-deleted, with Restore and Delete Permanently beside it. Until this existed the
 * only way to undo a mistaken delete, or to actually get rid of something, was a hand-written
 * statement against production — with no audit trail, no confirmation and no second pair of eyes.
 */
@Controller('admin/data')
export class AdminDataController {
  constructor(private readonly purge: PurgeService) {}

  /**
   * Gated on either permanent-delete code (any-of). Both live in SUPER_ADMIN_ONLY_CODES, so in
   * practice this is Super Admin — but the gate names the capability rather than the role, so if
   * the owner ever grants one of them to somebody through the matrix, the screen follows.
   */
  @Get('deleted') @RequirePermission('project.delete.permanent', 'task.delete.permanent')
  deleted() {
    return this.purge.listDeleted();
  }

  /**
   * Restore is gated on the ORDINARY delete permission, not the permanent one: undoing a delete
   * needs no more authority than making it did, and being unable to undo your own mistake is
   * what sent people to the database in the first place. No passcode — nothing is destroyed.
   */
  @Post('projects/:id/restore') @RequirePermission('project.delete')
  restoreProject(@Param('id') id: string) {
    return this.purge.restoreProject(id);
  }

  @Post('tasks/:id/restore') @RequirePermission('task.delete')
  restoreTask(@Param('id') id: string) {
    return this.purge.restoreTask(id);
  }
}

/**
 * The permanent deletes live under the entity's own prefix — DELETE /projects/:id/permanent sits
 * next to DELETE /projects/:id, so the pair reads as what it is: the soft delete and the real one.
 *
 * Three gates, and each one is doing separate work:
 *   · @RequirePermission — a Super-Admin-only code (see SUPER_ADMIN_ONLY_CODES).
 *   · @RequirePasscode   — the organisation step-up passcode, the same second factor the RBAC
 *                          mutations carry. Holding the permission is not enough; you have to
 *                          prove it is you, now.
 *   · ?confirm=<title>   — the title typed back, verified server-side in PurgeService. A dialog
 *                          alone protects nobody who can call the API directly.
 * And the service refuses outright unless the thing is already soft-deleted.
 */
@Controller('projects')
export class ProjectPurgeController {
  constructor(private readonly purge: PurgeService) {}

  @Delete(':id/permanent') @RequirePermission('project.delete.permanent') @RequirePasscode()
  remove(@Param('id') id: string, @Query('confirm') confirm?: string) {
    return this.purge.purgeProject(id, confirm ?? '');
  }
}

@Controller('tasks')
export class TaskPurgeController {
  constructor(private readonly purge: PurgeService) {}

  @Delete(':id/permanent') @RequirePermission('task.delete.permanent') @RequirePasscode()
  remove(@Param('id') id: string, @Query('confirm') confirm?: string) {
    return this.purge.purgeTask(id, confirm ?? '');
  }
}
