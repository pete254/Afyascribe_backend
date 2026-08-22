import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './entities/asset.entity';
import { AssetEvent } from './entities/asset-event.entity';
import { CreateAssetDto, UpdateAssetDto, AddAssetEventDto, ASSET_EVENT_TYPES } from './dto/asset.dto';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const todayStr = () => new Date().toISOString().slice(0, 10);

/** Straight-line depreciation position for an asset, as of today. */
export interface AssetDepreciation {
  cost: number;
  salvage: number;
  annual: number;
  accumulated: number;
  netBookValue: number;
}

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(AssetEvent) private readonly eventRepo: Repository<AssetEvent>,
  ) {}

  /** Straight-line depreciation; a disposed asset is treated as fully depreciated. */
  depreciation(a: Asset): AssetDepreciation {
    const cost = Number(a.purchaseCost || 0);
    const salvage = Number(a.salvageValue || 0);
    const life = Number(a.usefulLifeYears || 0);
    const base = Math.max(0, cost - salvage);
    let annual = 0;
    let accumulated = 0;
    if (a.depreciationMethod === 'straight_line' && life > 0 && a.purchaseDate) {
      annual = base / life;
      const years = (Date.now() - new Date(a.purchaseDate).getTime()) / (365.25 * 86400000);
      accumulated = Math.min(base, Math.max(0, annual * years));
    }
    if (a.status === 'disposed') accumulated = base;
    return {
      cost: r2(cost),
      salvage: r2(salvage),
      annual: r2(annual),
      accumulated: r2(accumulated),
      netBookValue: r2(cost - accumulated),
    };
  }

  private withDep(a: Asset) {
    return { ...a, depreciation: this.depreciation(a) };
  }

  async list(facilityId: string, filters: { type?: string; status?: string; q?: string }) {
    const qb = this.assetRepo
      .createQueryBuilder('a')
      .where('a.facility_id = :facilityId', { facilityId });
    if (filters.type) qb.andWhere('a.asset_type = :t', { t: filters.type });
    if (filters.status) qb.andWhere('a.status = :s', { s: filters.status });
    if (filters.q) {
      qb.andWhere('(a.name ILIKE :q OR a.asset_tag ILIKE :q OR a.serial_number ILIKE :q)', {
        q: `%${filters.q}%`,
      });
    }
    const assets = await qb.orderBy('a.created_at', 'DESC').getMany();
    return assets.map((a) => this.withDep(a));
  }

  async summary(facilityId: string) {
    const assets = await this.assetRepo.find({ where: { facilityId } });
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalCost = 0;
    let totalNbv = 0;
    for (const a of assets) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      byType[a.assetType] = (byType[a.assetType] || 0) + 1;
      const d = this.depreciation(a);
      totalCost = r2(totalCost + d.cost);
      totalNbv = r2(totalNbv + d.netBookValue);
    }
    return { count: assets.length, totalCost, totalNbv, byStatus, byType };
  }

  private async nextTag(facilityId: string): Promise<string> {
    const n = await this.assetRepo.count({ where: { facilityId } });
    return `AST-${String(n + 1).padStart(5, '0')}`;
  }

  async create(facilityId: string, dto: CreateAssetDto, userId?: string) {
    const asset = await this.assetRepo.save(
      this.assetRepo.create({
        facilityId,
        assetTag: dto.assetTag?.trim() || (await this.nextTag(facilityId)),
        name: dto.name.trim(),
        assetType: dto.assetType || 'equipment',
        serialNumber: dto.serialNumber?.trim() || null,
        description: dto.description?.trim() || null,
        purchaseDate: dto.purchaseDate || null,
        purchaseCost: String(dto.purchaseCost ?? 0),
        salvageValue: String(dto.salvageValue ?? 0),
        depreciationMethod: dto.depreciationMethod || 'straight_line',
        usefulLifeYears: String(dto.usefulLifeYears ?? 0),
        status: dto.status || 'in_use',
        custodian: dto.custodian?.trim() || null,
        location: dto.location?.trim() || null,
        supplier: dto.supplier?.trim() || null,
        notes: dto.notes?.trim() || null,
      }),
    );

    await this.eventRepo.save(
      this.eventRepo.create({
        facilityId,
        assetId: asset.id,
        type: 'acquired',
        date: dto.purchaseDate || todayStr(),
        amount: String(dto.purchaseCost ?? 0),
        toCustodian: dto.custodian?.trim() || null,
        note: 'Asset registered',
        createdById: userId ?? null,
      }),
    );

    return this.get(facilityId, asset.id);
  }

  async get(facilityId: string, id: string) {
    const asset = await this.assetRepo.findOne({ where: { id, facilityId } });
    if (!asset) throw new NotFoundException('Asset not found');
    const events = await this.eventRepo.find({
      where: { facilityId, assetId: id },
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return { ...this.withDep(asset), events };
  }

  async update(facilityId: string, id: string, dto: UpdateAssetDto) {
    const asset = await this.assetRepo.findOne({ where: { id, facilityId } });
    if (!asset) throw new NotFoundException('Asset not found');
    const set = <K extends keyof Asset>(k: K, v: Asset[K] | undefined) => {
      if (v !== undefined) asset[k] = v;
    };
    if (dto.name !== undefined) asset.name = dto.name.trim();
    set('assetType', dto.assetType as Asset['assetType']);
    set('serialNumber', (dto.serialNumber?.trim() || null) as Asset['serialNumber']);
    set('description', (dto.description?.trim() || null) as Asset['description']);
    set('purchaseDate', (dto.purchaseDate || null) as Asset['purchaseDate']);
    if (dto.purchaseCost !== undefined) asset.purchaseCost = String(dto.purchaseCost);
    if (dto.salvageValue !== undefined) asset.salvageValue = String(dto.salvageValue);
    set('depreciationMethod', dto.depreciationMethod as Asset['depreciationMethod']);
    if (dto.usefulLifeYears !== undefined) asset.usefulLifeYears = String(dto.usefulLifeYears);
    set('status', dto.status as Asset['status']);
    set('custodian', (dto.custodian?.trim() || null) as Asset['custodian']);
    set('location', (dto.location?.trim() || null) as Asset['location']);
    set('supplier', (dto.supplier?.trim() || null) as Asset['supplier']);
    set('notes', (dto.notes?.trim() || null) as Asset['notes']);
    await this.assetRepo.save(asset);
    return this.get(facilityId, id);
  }

  async addEvent(facilityId: string, id: string, dto: AddAssetEventDto, userId?: string) {
    const asset = await this.assetRepo.findOne({ where: { id, facilityId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (!ASSET_EVENT_TYPES.includes(dto.type)) {
      throw new BadRequestException(`Unknown event type ${dto.type}`);
    }

    const fromCustodian = asset.custodian;
    await this.eventRepo.save(
      this.eventRepo.create({
        facilityId,
        assetId: id,
        type: dto.type,
        date: dto.date || todayStr(),
        amount: String(dto.amount ?? 0),
        fromCustodian: dto.type === 'transferred' || dto.type === 'assigned' ? fromCustodian : null,
        toCustodian: dto.toCustodian?.trim() || null,
        note: dto.note?.trim() || null,
        createdById: userId ?? null,
      }),
    );

    // Side effects on the asset from the event.
    if ((dto.type === 'transferred' || dto.type === 'assigned') && dto.toCustodian?.trim()) {
      asset.custodian = dto.toCustodian.trim();
      await this.assetRepo.save(asset);
    } else if (dto.type === 'repair') {
      asset.status = 'in_repair';
      await this.assetRepo.save(asset);
    } else if (dto.type === 'disposed') {
      asset.status = 'disposed';
      await this.assetRepo.save(asset);
    }

    return this.get(facilityId, id);
  }

  async remove(facilityId: string, id: string) {
    const asset = await this.assetRepo.findOne({ where: { id, facilityId } });
    if (!asset) throw new NotFoundException('Asset not found');
    await this.eventRepo.delete({ facilityId, assetId: id });
    await this.assetRepo.remove(asset);
    return { deleted: true };
  }
}
