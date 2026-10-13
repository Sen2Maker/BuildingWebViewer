package io.github.sen2maker.buildingwebviewer.preview;
import android.content.Context;
import android.graphics.*;
import android.view.*;
/** Event-driven native thumb pad. It never polls or crosses the WebView bridge. */
final class NativeGaussianJoystick extends View {
 interface Listener {void changed(float horizontal,float vertical);}
 final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);final Listener listener;final String title,top,bottom,left,right;final float density;
 float horizontal,vertical;int pointer=-1;
 NativeGaussianJoystick(Context context,String title,String top,String bottom,String left,String right,Listener listener){super(context);this.title=title;this.top=top;this.bottom=bottom;this.left=left;this.right=right;this.listener=listener;density=getResources().getDisplayMetrics().density;setContentDescription(title+": "+top+", "+bottom+", "+left+", "+right);setFocusable(true);setClickable(true);}
 float radius(){return Math.min(getWidth(),getHeight())*.265f;}
 @Override protected void onDraw(Canvas c){super.onDraw(c);float w=getWidth(),h=getHeight(),x=w/2,y=h*.55f,r=radius();paint.setColor(Color.argb(235,248,252,250));c.drawRoundRect(0,0,w,h,14*density,14*density,paint);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(density);paint.setColor(Color.rgb(205,224,215));c.drawRoundRect(density/2,density/2,w-density/2,h-density/2,14*density,14*density,paint);paint.setStyle(Paint.Style.FILL);
  paint.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(12*density);paint.setColor(Color.rgb(37,80,65));c.drawText(title,x,18*density,paint);paint.setColor(Color.rgb(229,240,234));c.drawCircle(x,y,r,paint);paint.setColor(Color.rgb(204,224,212));paint.setStrokeWidth(density);c.drawLine(x-r*.65f,y,x+r*.65f,y,paint);c.drawLine(x,y-r*.65f,x,y+r*.65f,paint);
  paint.setTextSize(9*density);paint.setColor(Color.rgb(82,116,98));c.drawText(top,x,y-r-6*density,paint);c.drawText(bottom,x,h-8*density,paint);c.drawText(left,w*.12f,y+3*density,paint);c.drawText(right,w*.88f,y+3*density,paint);
  float knob=r*.36f;paint.setColor(Color.argb(pointer<0?140:245,44,119,90));c.drawCircle(x+horizontal*r*.64f,y-vertical*r*.64f,knob,paint);paint.setColor(Color.WHITE);c.drawCircle(x+horizontal*r*.64f,y-vertical*r*.64f,3*density,paint);
 }
 void update(float x,float y){float r=Math.max(1,radius()),dx=(x-getWidth()/2f)/r,dy=(getHeight()*.55f-y)/r,len=(float)Math.hypot(dx,dy);if(len<.08f){horizontal=vertical=0;}else{float size=Math.min(1,(len-.08f)/.92f);horizontal=dx/len*size;vertical=dy/len*size;}listener.changed(horizontal,vertical);invalidate();}
 void reset(){pointer=-1;horizontal=vertical=0;listener.changed(0,0);invalidate();}
 @Override public boolean onTouchEvent(MotionEvent e){int action=e.getActionMasked();if(action==MotionEvent.ACTION_DOWN){pointer=e.getPointerId(0);getParent().requestDisallowInterceptTouchEvent(true);update(e.getX(),e.getY());return true;}if(action==MotionEvent.ACTION_CANCEL||action==MotionEvent.ACTION_UP){reset();getParent().requestDisallowInterceptTouchEvent(false);if(action==MotionEvent.ACTION_UP)performClick();return true;}int index=e.findPointerIndex(pointer);if(action==MotionEvent.ACTION_POINTER_UP&&e.getPointerId(e.getActionIndex())==pointer){reset();return true;}if(index>=0&&action==MotionEvent.ACTION_MOVE){update(e.getX(index),e.getY(index));return true;}return true;}
 @Override public boolean performClick(){super.performClick();return true;}
 @Override protected void onDetachedFromWindow(){reset();super.onDetachedFromWindow();}
}
