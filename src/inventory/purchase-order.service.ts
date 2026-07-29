import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { Supplier } from './entities/supplier.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { CreatePurchaseOrderDto, DecisionDto } from './dto/purchase-order.dto';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class PurchaseOrderService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly orders: Repository<PurchaseOrder>,
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(Facility)
    private readonly facilities: Repository<Facility>,
  ) {}

  /** True when this user may approve LPOs at this facility. */
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
    dto: CreatePurchaseOrderDto,
    user: CurrentUserType,
  ): Promise<PurchaseOrder> {
    const supplier = await this.suppliers.findOne({ where: { id: dto.supplierId, facilityId } });
    if (!supplier) throw new BadRequestException('Unknown supplier');
    if (!dto.lines?.length) throw new BadRequestException('An LPO needs at least one line');

    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    if (!facility) throw new NotFoundException('Facility not found');

    const subtotal = r2(dto.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    const taxRate = dto.taxRate ?? 0;
    const taxAmount = r2((subtotal * taxRate) / 100);
    const total = r2(subtotal + taxAmount);

    const count = await this.orders.count({ where: { facilityId } });
    const authorised = this.canApprove(user, facility);
    const now = new Date();

    const order = this.orders.create({
      facilityId,
      lpoNo: `LPO-${String(count + 1).padStart(6, '0')}`,
      supplierId: supplier.id,
      date: dto.date ?? today(),
      expectedDate: dto.expectedDate ?? null,
      status: authorised ? 'approved' : 'pending_approval',
      subtotal: subtotal.toFixed(2),
      taxRate: taxRate.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      deliveryAddress: dto.deliveryAddress ?? null,
      terms: dto.terms ?? null,
      notes: dto.notes ?? null,
      createdById: user.id,
      createdByName: this.fullName(user),
      approvedById: authorised ? user.id : null,
      approvedByName: authorised ? this.fullName(user) : null,
      approvedAt: authorised ? now : null,
      lines: dto.lines.map((l) =>
        this.orders.manager.getRepository(PurchaseOrderLine).create({
          itemId: l.itemId ?? null,
          description: l.description.trim(),
          quantity: l.quantity.toFixed(3),
          unitPrice: l.unitPrice.toFixed(2),
          lineTotal: r2(l.quantity * l.unitPrice).toFixed(2),
        }),
      ),
    });

    return this.orders.save(order);
  }

  list(facilityId: string, status?: string): Promise<PurchaseOrder[]> {
    const where: any = { facilityId };
    if (status) where.status = status;
    return this.orders.find({ where, relations: ['lines'], order: { createdAt: 'DESC' }, take: 100 });
  }

  async get(facilityId: string, id: string): Promise<PurchaseOrder> {
    const po = await this.orders.findOne({ where: { id, facilityId }, relations: ['lines'] });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async approve(facilityId: string, id: string, user: CurrentUserType, dto: DecisionDto): Promise<PurchaseOrder> {
    const po = await this.get(facilityId, id);
    if (po.status !== 'pending_approval') {
      throw new BadRequestException(`LPO is already ${po.status}`);
    }
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    if (!facility || !this.canApprove(user, facility)) {
      throw new ForbiddenException('You are not authorised to approve LPOs');
    }
    po.status = 'approved';
    po.approvedById = user.id;
    po.approvedByName = this.fullName(user);
    po.approvedAt = new Date();
    po.decisionNote = dto.note ?? null;
    return this.orders.save(po);
  }

  async reject(facilityId: string, id: string, user: CurrentUserType, dto: DecisionDto): Promise<PurchaseOrder> {
    const po = await this.get(facilityId, id);
    if (po.status !== 'pending_approval') {
      throw new BadRequestException(`LPO is already ${po.status}`);
    }
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    if (!facility || !this.canApprove(user, facility)) {
      throw new ForbiddenException('You are not authorised to decide on LPOs');
    }
    po.status = 'rejected';
    po.approvedById = user.id;
    po.approvedByName = this.fullName(user);
    po.approvedAt = new Date();
    po.decisionNote = dto.note ?? null;
    return this.orders.save(po);
  }

  async cancel(facilityId: string, id: string, user: CurrentUserType): Promise<PurchaseOrder> {
    const po = await this.get(facilityId, id);
    if (po.status === 'received') throw new BadRequestException('Received LPOs cannot be cancelled');
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    const isRaiser = po.createdById === user.id;
    if (!isRaiser && (!facility || !this.canApprove(user, facility))) {
      throw new ForbiddenException('Only the raiser or an approver can cancel an LPO');
    }
    po.status = 'cancelled';
    return this.orders.save(po);
  }
}
