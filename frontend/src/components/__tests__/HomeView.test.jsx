import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomeView from '../HomeView.jsx';

const noop = vi.fn();

function renderHome(props = {}) {
  return render(
    <HomeView
      busy={false}
      books={[{ id: 'u1', name: '书A', encoding: 'UTF-8', uploadedAt: 1 }]}
      theme="default"
      onOpenBuiltIn={noop}
      onUploadFile={noop}
      onOpenBook={noop}
      onOpenSettings={noop}
      onOpenByokSettings={noop}
      onToggleTheme={noop}
      onDeleteBook={noop}
      {...props}
    />
  );
}

describe('首页删书入口', () => {
  it('uploaded books get a delete button, the built-in book does not', () => {
    renderHome();
    expect(screen.getByRole('button', { name: '删除 书A' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除 内置书/ })).not.toBeInTheDocument();
  });

  it('confirm dialog deletes the book, cancel keeps it', async () => {
    const onDeleteBook = vi.fn();
    renderHome({ onDeleteBook });

    await userEvent.click(screen.getByRole('button', { name: '删除 书A' }));
    expect(await screen.findByText('删除书籍')).toBeInTheDocument();
    expect(screen.getByText(/删除不可恢复/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onDeleteBook).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '删除 书A' }));
    await userEvent.click(screen.getByRole('button', { name: '删除', exact: true }));
    expect(onDeleteBook).toHaveBeenCalledWith({ id: 'u1', name: '书A', encoding: 'UTF-8', uploadedAt: 1 });
  });
});
