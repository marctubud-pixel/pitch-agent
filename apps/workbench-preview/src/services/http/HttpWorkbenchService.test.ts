import {describe, expect, it, vi} from 'vitest';
import {HttpWorkbenchService} from './HttpWorkbenchService';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServices} from '../index';
import {ServiceProvider} from '../../app/services';
import {I18nProvider} from '../../i18n';
import {DemoIndicator} from '../../app/DemoPanel';

describe('unimplemented HTTP service availability', () => {
  it('keeps configured URL separate from a real connection', async () => {
    const fetchImpl = vi.fn();
    const service = new HttpWorkbenchService({baseUrl: 'https://configured.example', fetchImpl});
    expect(service.environment).toEqual({kind: 'unavailable', label: '后端未接通'});
    await expect(service.listProjects()).rejects.toMatchObject({kind: 'unavailable', message: '后端尚未接通，暂时无法执行此操作。'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('renders an unavailable header instead of claiming a connection', () => {
    const services = createServices();
    try {
      const children = createElement(I18nProvider, {children: createElement(DemoIndicator)});
      const html = renderToStaticMarkup(createElement(ServiceProvider, {
        service: new HttpWorkbenchService({baseUrl: 'https://configured.example'}),
        intake: services.intake,
        assistant: services.assistant,
        proposals: services.proposals,
        children,
      }));
      expect(html).toContain('后端未接通');
      expect(html).not.toContain('已连接');
    } finally {
      services.team.destroy();
    }
  });
});
