import { Controller, Get, Query, Param, UseGuards, HttpException, HttpStatus, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Icd11Service } from './icd11.service';

@ApiTags('icd11')
@Controller('icd11')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class Icd11Controller {
  constructor(private readonly icd11Service: Icd11Service) {}

  @Get('search')
  @ApiOperation({ 
    summary: 'Search ICD-11 diagnosis codes',
    description: 'Searches local database first, falls back to WHO API if needed. Results are automatically cached.'
  })
  @ApiQuery({ name: 'q', description: 'Search query (disease name, code, etc.)', required: true })
  @ApiQuery({ name: 'limit', description: 'Maximum results to return', required: false })
  @ApiResponse({ status: 200, description: 'Successfully retrieved codes' })
  @ApiResponse({ status: 400, description: 'Invalid query' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit: string = '15',
  ) {
    if (!query || query.trim().length < 2) {
      throw new HttpException(
        'Query must be at least 2 characters',
        HttpStatus.BAD_REQUEST
      );
    }

    const limitNum = Math.min(parseInt(limit) || 15, 50); // Max 50 results
    
    return this.icd11Service.searchCodes(query, limitNum);
  }

  @Get('popular')
  @ApiOperation({ 
    summary: 'Get most frequently used ICD-11 codes',
    description: 'Returns codes ordered by usage frequency'
  })
  @ApiQuery({ name: 'limit', description: 'Number of codes to return', required: false })
  async getPopular(@Query('limit') limit: string = '20') {
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    return this.icd11Service.getMostUsedCodes(limitNum);
  }

  @Get('chapter/:chapterCode')
  @ApiOperation({ summary: 'Get codes by chapter' })
  @ApiQuery({ name: 'limit', required: false })
  async getByChapter(
    @Param('chapterCode') chapterCode: string,
    @Query('limit') limit: string = '50',
  ) {
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    return this.icd11Service.getCodesByChapter(chapterCode, limitNum);
  }

  @Get('code/:code')
  @ApiOperation({ 
    summary: 'Get details of a specific ICD-11 code',
    description: 'Retrieves full details of a code. If not in local cache, fetches from WHO API.'
  })
  @ApiResponse({ status: 200, description: 'Code details retrieved' })
  @ApiResponse({ status: 404, description: 'Code not found' })
  async getCode(@Param('code') code: string) {
    if (!this.icd11Service.validateCodeFormat(code)) {
      throw new HttpException(
        'Invalid ICD-11 code format. Expected format: A00 or A00.0',
        HttpStatus.BAD_REQUEST
      );
    }

    const codeDetails = await this.icd11Service.getCodeDetails(code);
    
    if (!codeDetails) {
      throw new HttpException(
        `ICD-11 code '${code}' not found`,
        HttpStatus.NOT_FOUND
      );
    }

    return codeDetails;
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Validate ICD-11 code format' })
  validateCode(@Param('code') code: string) {
    const isValid = this.icd11Service.validateCodeFormat(code);
    return {
      code,
      valid: isValid,
      message: isValid ? 'Valid ICD-11 code format' : 'Invalid ICD-11 code format'
    };
  }

  // ✅ NEW: Seed database endpoint
  @Post('seed')
  @ApiOperation({ 
    summary: 'Seed database with common ICD-11 codes',
    description: 'Populates the database with common ICD-11 codes. Run this once after setup. Safe to run multiple times (won\'t create duplicates).'
  })
  @ApiResponse({ status: 200, description: 'Database seeded successfully' })
  async seedDatabase() {
    await this.icd11Service.seedCommonCodes();
    return { 
      success: true,
      message: 'Database seeded with common ICD-11 codes. You can now search for malaria, diabetes, hypertension, etc.' 
    };
  }
}