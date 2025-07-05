import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { NgxEditorComponent as NgxEditorView, NgxEditorMenuComponent, Editor } from 'ngx-editor';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
@Component({
    selector: 'app-md-editor',
    standalone: true,
    imports: [NgxEditorView, NgxEditorMenuComponent, FormsModule],
    template: `
      <div class="NgxEditor__Wrapper">
        <ngx-editor-menu [editor]="editor"></ngx-editor-menu>
        <ngx-editor
          class="custom-editor"
          [editor]="editor"
          [(ngModel)]="html"
          (ngModelChange)="onContentChange($event)"
          [placeholder]="'Type here...'"
        ></ngx-editor>
      </div>
    `,
    styles: [`
      .custom-editor {
        min-height: 300px;
        display: block;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 8px;
        background-color: #fff;
      }
    `],
    providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MdEditorComponent),
      multi: true
    }
  ]
  })
  export class MdEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {
    @Input() initialContent = '';
    @Output() contentChange = new EventEmitter<string>();
  
    html = '';
    editor!: Editor;

    private onChange = (value: any) => {};
    private onTouched = () => {};

    ngOnInit(): void {
      this.editor = new Editor();
      this.html = this.initialContent;
    }
  
    onContentChange(value: string) {
      this.html = value;
      this.onChange(value);
    }
  
    ngOnDestroy(): void {
      this.editor.destroy();
    }

    writeValue(value: string): void {
      this.html = value || '';
    }

    registerOnChange(fn: any): void {
      this.onChange = fn;
    }

    registerOnTouched(fn: any): void {
      this.onTouched = fn;
    }

  }
  