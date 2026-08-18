import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseRequisition } from './entities/purchase-requisition.entity';
import { PurchaseRequisitionLine } from './entities/purchase-requisition-line.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { CreateRequisitionDto } from './dto/purchase-requisition.dto';
import { DecisionDto } from './dto/purchase-order.dto';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class PurchaseRequisitionService {
  constructor(
    @InjectRepository(PurchaseRequisition)
    private readonly reqs: Repository<PurchaseRequisition>,
    @InjectRepository(Facility)
    private readonly facilities: Repository<Facility>,
  ) {}

  /** Same authority as LPOs: owner/admin, or an accountant the owner delegated. */
  private canApprove(user: CurrentUserType, facility: Facility): boolean {
    if (user.role === 'super_admin' || user.role === 'facility_admin') return true;
    if ((user as any).isOwner === true) return true;
    if (user.role === 'accountant' && facility.accountantCanApproveLpo) return true;
    return false;
  }

  private fullName(user: CurrentUserType): string {
    return `${(user as any).firstName ?? ''} ${(user as any).lastName ?? ''}`.trim() || user.email;
  }

  async create(
    facilityId: string,
    dto: CreateRequisitionDto,
    user: CurrentUserType,
  ): Promise<PurchaseRequisition> {
    if (!dto.lines?.length) throw new BadRequestException('A requisition needs at least one line');
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    if (!facility) throw new NotFoundException('Facility not found');

    const estimatedTotal = r2(
      dto.lines.reduce((s, l) => s + l.quantity * (l.estimatedUnitPrice ?? 0), 0),
    );
    const count = await this.reqs.count({ where: { facilityId } });
    const authorised = this.canApprove(user, facility);
    const now = new Date();

    const req = this.reqs.create({
      facilityId,
      prNo: `PR-${String(count + 1).padStart(6, '0')}`,
      department: dto.department ?? null,
      requestedByName: this.fullName(user),
      date: dto.date ?? today(),
      neededBy: dto.neededBy ?? null,
      status: authorised ? 'approved' : 'pending_approval',
      estimatedTotal: estimatedTotal.toFixed(2),
      notes: dto.notes ?? null,
      createdById: user.id,
      approvedById: authorised ? user.id : null,
      approvedByName: authorised ? this.fullName(user) : null,
      approvedAt: authorised ? now : null,
      lines: dto.lines.map((l) =>
        this.reqs.manager.getRepository(PurchaseRequisitionLine).create({
          itemId: l.itemId ?? null,
          description: l.description.trim(),
          category: l.category ?? null,
          unit: l.unit ?? null,
          quantity: l.quantity.toFixed(3),
          estimatedUnitPrice: (l.estimatedUnitPrice ?? 0).toFixed(2),
          purpose: l.purpose ?? null,
        }),
      ),
    });
    return this.reqs.save(req);
  }

  list(facilityId: string, status?: string): Promise<PurchaseRequisition[]> {
    const where: any = { facilityId };
    if (status) where.status = status;
    return this.reqs.find({ where, relations: ['lines'], order: { createdAt: 'DESC' }, take: 100 });
  }

  async get(facilityId: string, id: string): Promise<PurchaseRequisition> {
    const req = await this.reqs.findOne({ where: { id, facilityId }, relations: ['lines'] });
    if (!req) throw new NotFoundException('Requisition not found');
    return req;
  }

  private async decide(
    facilityId: string,
    id: string,
    user: CurrentUserType,
    status: 'approved' | 'rejected',
    note?: string,
  ): Promise<PurchaseRequisition> {
    const req = await this.get(facilityId, id);
    if (req.status !== 'pending_approval') throw new BadRequestException(`Requisition is already ${req.status}`);
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    if (!facility || !this.canApprove(user, facility)) {
      throw new ForbiddenException('You are not authorised to decide on requisitions');
    }
    req.status = status;
    req.approvedById = user.id;
    req.approvedByName = this.fullName(user);
    req.approvedAt = new Date();
    req.decisionNote = note ?? null;
    return this.reqs.save(req);
  }

  approve(facilityId: string, id: string, user: CurrentUserType, dto: DecisionDto) {
    return this.decide(facilityId, id, user, 'approved', dto.note);
  }

  reject(facilityId: string, id: string, user: CurrentUserType, dto: DecisionDto) {
    return this.decide(facilityId, id, user, 'rejected', dto.note);
  }

  async cancel(facilityId: string, id: string, user: CurrentUserType): Promise<PurchaseRequisition> {
    const req = await this.get(facilityId, id);
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    const isRaiser = req.createdById === user.id;
    if (!isRaiser && (!facility || !this.canApprove(user, facility))) {
      throw new ForbiddenException('Only the raiser or an approver can cancel a requisition');
    }
    req.status = 'cancelled';
    return this.reqs.save(req);
  }
}
