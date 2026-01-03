import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(
    @CurrentUser('_id') userId: string,
    @Body() createProjectDto: CreateProjectDto,
  ) {
    return this.projectsService.create(userId, createProjectDto);
  }

  @Get()
  findAll(@CurrentUser('_id') userId: string) {
    return this.projectsService.findAll(userId);
  }

  @Get('stats')
  getStats(@CurrentUser('_id') userId: string) {
    return this.projectsService.getStats(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('_id') userId: string, @Param('id') id: string) {
    return this.projectsService.findOne(userId, id);
  }

  @Get(':id/tasks')
  getTasks(@CurrentUser('_id') userId: string, @Param('id') id: string) {
    return this.projectsService.getTasks(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('_id') userId: string,
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    return this.projectsService.update(userId, id, updateProjectDto);
  }

  @Delete(':id')
  remove(@CurrentUser('_id') userId: string, @Param('id') id: string) {
    return this.projectsService.remove(userId, id);
  }
}
