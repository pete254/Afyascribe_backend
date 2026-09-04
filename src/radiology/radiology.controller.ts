import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { RadiologyService } from './radiology.service';
import { CreateRadiologyDto } from './dto/create-radiology.dto';
import { UpdateRadiologyDto } from './dto/update-radiology.dto';

@Controller('radiology')
export class RadiologyController {
  constructor(private readonly service: RadiologyService) {}

  @Post()
  create(@Body() dto: CreateRadiologyDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRadiologyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
